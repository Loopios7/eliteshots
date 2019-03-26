/*
 * KodeBlox Copyright 2019 Sayak Mukhopadhyay
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http: //www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict'

const express = require('express')
const path = require('path')
const multer = require('multer')
const jimp = require('jimp')

const backblaze = require('../modules/backblaze')
const secrets = require('../../secrets')
const upload = multer()

let albumModel = require('../models/albums')
let imageModel = require('../models/images')
let likesModel = require('../models/likes')
let savesModel = require('../models/saves')
let viewsModel = require('../models/views')

let imageUrlRoute = 'https://cdn.eliteshots.gallery/file/eliteshots/'

let router = express.Router()

router.post('/upload', upload.single('screenshot'), async (req, res, next) => {
  try {
    if (req.user) {
      if (req.user.access !== 2) {
        let createdDate = new Date()
        let album
        if (req.body.albumTitle) {
          let albumModelResolved = await albumModel
          album = await albumModelResolved.findOne({
            user_id: req.user._id,
            title_lower: req.body.albumTitle.toLowerCase()
          }).lean()
          if (!album) {
            let albumDocument = new albumModelResolved({
              title: req.body.albumTitle,
              title_lower: req.body.albumTitle.toLowerCase(),
              description: '',
              description_lower: '',
              created_at: createdDate,
              last_modified_at: createdDate,
              user_id: req.user._id
            })
            album = await albumDocument.save()
          }
        }

        let originalImage = await jimp.read(req.file.buffer)

        let imageResize = await Promise.all([
          originalImage.scaleToFit(1920, 1080).quality(50).getBufferAsync(jimp.MIME_JPEG),
          originalImage.scaleToFit(480, 320).quality(50).getBufferAsync(jimp.MIME_JPEG)
        ])

        let lowQualityImage = imageResize[0]
        let thumbnailImage = imageResize[1]

        let urlParams = (await Promise.all([
          backblaze.getUploadUrl(secrets.b2_bucket_id),
          backblaze.getUploadUrl(secrets.b2_bucket_id),
          backblaze.getUploadUrl(secrets.b2_bucket_id)
        ])).map(response => {
          return response.data
        })

        let fileExtension = path.extname(req.file.originalname)
        let fileName = path.basename(req.file.originalname, fileExtension)

        let originalFileName = `${req.user._id}/${createdDate.getTime()}-${req.file.originalname}`
        let lowQualityFileName = `${req.user._id}/${createdDate.getTime()}-${fileName}_lq.jpeg`
        let thumbnailFileName = `${req.user._id}/${createdDate.getTime()}-${fileName}_thumb.jpeg`

        await Promise.all([
          backblaze.uploadFile({
            uploadUrl: urlParams[0].uploadUrl,
            uploadAuthToken: urlParams[0].authorizationToken,
            fileName: originalFileName,
            data: req.file.buffer,
            mime: req.file.mimetype,
            onUploadProgress: event => {
              console.log(event)
            }
          }),
          backblaze.uploadFile({
            uploadUrl: urlParams[1].uploadUrl,
            uploadAuthToken: urlParams[1].authorizationToken,
            fileName: lowQualityFileName,
            data: lowQualityImage,
            mime: jimp.MIME_JPEG
          }),
          backblaze.uploadFile({
            uploadUrl: urlParams[2].uploadUrl,
            uploadAuthToken: urlParams[2].authorizationToken,
            fileName: thumbnailFileName,
            data: thumbnailImage,
            mime: jimp.MIME_JPEG
          })
        ])

        let imageModelResolved = await imageModel
        let imageDocument = new imageModelResolved({
          image_location: originalFileName,
          thumbnail_location: thumbnailFileName,
          low_res_location: lowQualityFileName,
          title: req.body.imageTitle,
          title_lower: req.body.imageTitle.toLowerCase(),
          description: req.body.imageDescription,
          description_lower: req.body.imageDescription.toLowerCase(),
          public: req.body.isPublic === 'true',
          album_id: album ? album._id : undefined,
          uploaded_at: createdDate,
          last_modified_at: createdDate,
          user_id: req.user._id
        })
        await imageDocument.save()
        res.status(201).send({})
      } else {
        res.status(403).send({})
      }
    } else {
      res.status(401).send({})
    }
  } catch (err) {
    next(err)
  }
})

router.get('/albums/self', async (req, res, next) => {
  try {
    if (req.user) {
      if (req.user.access !== 2) {
        let model = await albumModel
        let albums = await model.find({ user_id: req.user._id }).lean()
        res.send(albums)
      } else {
        res.status(403).send({})
      }
    } else {
      res.status(401).send({})
    }
  } catch (err) {
    next(err)
  }
})

router.get('/images/popular', async (req, res, next) => {
  try {
    let model = await imageModel
    let page = req.query.page || 1
    let aggregate = model.aggregate()
    let aggregateOptions = {
      page: page,
      limit: 8
    }

    aggregate.lookup({
      from: 'views',
      localField: '_id',
      foreignField: 'image_id',
      as: 'views'
    }).lookup({
      from: 'likes',
      localField: '_id',
      foreignField: 'image_id',
      as: 'likes'
    }).lookup({
      from: 'saves',
      localField: '_id',
      foreignField: 'image_id',
      as: 'saves'
    }).addFields({
      no_of_views: {
        $size: '$views'
      },
      no_of_likes: {
        $size: '$likes'
      },
      no_of_saves: {
        $size: '$saves'
      }
    })

    if (req.user) {
      aggregate.addFields({
        self_like: {
          $size: {
            $filter: {
              input: '$likes',
              as: 'el',
              cond: {
                $eq: ['$$el.user_id', req.user._id]
              }
            }
          }
        },
        self_save: {
          $size: {
            $filter: {
              input: '$saves',
              as: 'el',
              cond: {
                $eq: ['$$el.user_id', req.user._id]
              }
            }
          }
        }
      })
    }
    aggregate.addFields({
      score: {
        $add: [{
          $log10: {
            $cond: {
              if: { $gt: ['$no_of_likes', 0] },
              then: '$no_of_likes',
              else: 1
            }
          }
        }, {
          $divide: [
            { $subtract: ['$uploaded_at', new Date(1551378600000)] },
            4500000
          ]
        }]
      }
    }).sort({
      score: -1
    }).project({
      views: 0,
      likes: 0,
      saves: 0,
      score: 0
    })

    let imageData = await model.aggregatePaginate(aggregate, aggregateOptions)

    imageData.data.map(image => {
      image.image_location = `${imageUrlRoute}${image.image_location}`
      image.thumbnail_location = `${imageUrlRoute}${image.thumbnail_location}`
      image.low_res_location = `${imageUrlRoute}${image.low_res_location}`
      image.anonymous_views = image.anonymous_views ? image.anonymous_views : 0
      if (req.user) {
        image.self_like = !!image.self_like
        image.self_save = !!image.self_save
      }
    })
    res.send(imageData)
  } catch (err) {
    next(err)
  }
})

router.get('/images/recents', async (req, res, next) => {
  try {
    let model = await imageModel
    let page = req.query.page || 1
    let aggregate = model.aggregate()
    let aggregateOptions = {
      sortBy: { uploaded_at: -1 },
      page: page,
      limit: 8
    }

    aggregate.lookup({
      from: 'views',
      localField: '_id',
      foreignField: 'image_id',
      as: 'views'
    }).lookup({
      from: 'likes',
      localField: '_id',
      foreignField: 'image_id',
      as: 'likes'
    }).lookup({
      from: 'saves',
      localField: '_id',
      foreignField: 'image_id',
      as: 'saves'
    }).addFields({
      no_of_views: {
        $size: '$views'
      },
      no_of_likes: {
        $size: '$likes'
      },
      no_of_saves: {
        $size: '$saves'
      }
    })

    if (req.user) {
      aggregate.addFields({
        self_like: {
          $size: {
            $filter: {
              input: '$likes',
              as: 'el',
              cond: {
                $eq: ['$$el.user_id', req.user._id]
              }
            }
          }
        },
        self_save: {
          $size: {
            $filter: {
              input: '$saves',
              as: 'el',
              cond: {
                $eq: ['$$el.user_id', req.user._id]
              }
            }
          }
        }
      })
    }
    aggregate.project({
      views: 0,
      likes: 0,
      saves: 0
    })

    let imageData = await model.aggregatePaginate(aggregate, aggregateOptions)

    imageData.data.map(image => {
      image.image_location = `${imageUrlRoute}${image.image_location}`
      image.thumbnail_location = `${imageUrlRoute}${image.thumbnail_location}`
      image.low_res_location = `${imageUrlRoute}${image.low_res_location}`
      image.anonymous_views = image.anonymous_views ? image.anonymous_views : 0
      if (req.user) {
        image.self_like = !!image.self_like
        image.self_save = !!image.self_save
      }
    })
    res.send(imageData)
  } catch (err) {
    next(err)
  }
})

router.get('/images/curated', async (req, res, next) => {
  try {
    let model = await imageModel
    let page = req.query.page || 1
    let aggregate = model.aggregate()
    let aggregateOptions = {
      sortBy: { curated_at: -1 },
      page: page,
      limit: 8
    }
    let query = { curated: true }

    aggregate.match(query).lookup({
      from: 'views',
      localField: '_id',
      foreignField: 'image_id',
      as: 'views'
    }).lookup({
      from: 'likes',
      localField: '_id',
      foreignField: 'image_id',
      as: 'likes'
    }).lookup({
      from: 'saves',
      localField: '_id',
      foreignField: 'image_id',
      as: 'saves'
    }).addFields({
      no_of_views: {
        $size: '$views'
      },
      no_of_likes: {
        $size: '$likes'
      },
      no_of_saves: {
        $size: '$saves'
      }
    })

    if (req.user) {
      aggregate.addFields({
        self_like: {
          $size: {
            $filter: {
              input: '$likes',
              as: 'el',
              cond: {
                $eq: ['$$el.user_id', req.user._id]
              }
            }
          }
        },
        self_save: {
          $size: {
            $filter: {
              input: '$saves',
              as: 'el',
              cond: {
                $eq: ['$$el.user_id', req.user._id]
              }
            }
          }
        }
      })
    }
    aggregate.project({
      views: 0,
      likes: 0,
      saves: 0
    })

    let imageData = await model.aggregatePaginate(aggregate, aggregateOptions)

    imageData.data.map(image => {
      image.image_location = `${imageUrlRoute}${image.image_location}`
      image.thumbnail_location = `${imageUrlRoute}${image.thumbnail_location}`
      image.low_res_location = `${imageUrlRoute}${image.low_res_location}`
      image.anonymous_views = image.anonymous_views ? image.anonymous_views : 0
      if (req.user) {
        image.self_like = !!image.self_like
        image.self_save = !!image.self_save
      }
    })
    res.send(imageData)
  } catch (err) {
    next(err)
  }
})

router.put('/images/:imageId/view', async (req, res, next) => {
  try {
    if (req.user) {
      let model = await viewsModel
      let viewDocument = new model({
        image_id: req.params.imageId,
        user_id: req.user._id,
        viewed_at: new Date()
      })
      await viewDocument.save()
    } else {
      let model = await imageModel
      await model.findOneAndUpdate({
        _id: req.params.imageId
      }, {
        $inc: { anonymous_views: 1 }
      })
    }
    res.status(200).send({})
  } catch (err) {
    next(err)
  }
})

router.put('/images/:imageId/like', async (req, res, next) => {
  try {
    if (req.user) {
      let model = await likesModel
      let liked = await model.findOne({
        image_id: req.params.imageId,
        user_id: req.user._id
      }).lean()
      if (liked) {
        await model.findOneAndRemove({
          image_id: req.params.imageId,
          user_id: req.user._id
        })
      } else {
        let likesDocument = new model({
          image_id: req.params.imageId,
          user_id: req.user._id,
          liked_at: new Date()
        })
        await likesDocument.save()
      }
      res.status(200).send({})
    } else {
      res.status(401).send({})
    }
  } catch (err) {
    next(err)
  }
})

router.put('/images/:imageId/save', async (req, res, next) => {
  try {
    if (req.user) {
      let model = await savesModel
      let saves = await model.findOne({
        image_id: req.params.imageId,
        user_id: req.user._id
      }).lean()
      if (saves) {
        await model.findOneAndRemove({
          image_id: req.params.imageId,
          user_id: req.user._id
        })
      } else {
        let savesDocument = new model({
          image_id: req.params.imageId,
          user_id: req.user._id,
          saved_at: new Date()
        })
        await savesDocument.save()
      }
      res.status(200).send({})
    } else {
      res.status(401).send({})
    }
  } catch (err) {
    next(err)
  }
})

module.exports = router