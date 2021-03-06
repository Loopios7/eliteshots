/*
 * KodeBlox Copyright 2020 Sayak Mukhopadhyay
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

const mongoose = require('mongoose')

let Schema = mongoose.Schema
let ObjectId = mongoose.Schema.Types.ObjectId

let modActions = new Schema({
  action: {
    type: String,
    enum: ['BAN', 'UNBAN', 'PROMOTE', 'DEMOTE', 'TRUST', 'UNTRUST', 'ACCEPT', 'REJECT', 'CURATE'],
    uppercase: true
  },
  target_user: { type: ObjectId, index: true },
  target_image: { type: ObjectId, index: true },
  comments: String,
  comments_lower: { type: String, lowercase: true, index: true },
  action_at: { type: Date, index: true },
  mod_user_id: { type: ObjectId, index: true }
}, { runSettersOnQuery: true })

module.exports = mongoose.model('modActions', modActions)
