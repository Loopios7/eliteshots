<!--
  - KodeBlox Copyright 2020 Sayak Mukhopadhyay
  -
  - Licensed under the Apache License, Version 2.0 (the "License");
  - you may not use this file except in compliance with the License.
  - You may obtain a copy of the License at
  -
  - http: //www.apache.org/licenses/LICENSE-2.0
  -
  - Unless required by applicable law or agreed to in writing, software
  - distributed under the License is distributed on an "AS IS" BASIS,
  - WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  - See the License for the specific language governing permissions and
  - limitations under the License.
  -->

<template>
  <div>
    <h1>Liked Images</h1>
    <image-gallery :imageItems="likedImages"
                   :loading="loadingNewImages"
                   :end="imagesEnd"
                   link-key="image_location"
                   @imageViewed="onClickThumbnail"
                   @imageLiked="onClickLike"
                   @imageSaved="onClickSave"
                   @fetchImages="onFetchImages"
                   :authenticated="authenticated"
                   curation-banner/>
  </div>
</template>

<script>
import { mapState } from 'vuex'
import ImageGallery from '@/components/ImageGallery'

export default {
  name: 'Likes',
  components: {
    'image-gallery': ImageGallery
  },
  data () {
    return {
      loadingNewImages: false,
      imagesEnd: false
    }
  },
  computed: {
    ...mapState({
      likedImages: state => state.self.liked,
      authenticated: state => state.auth.authenticated
    })
  },
  created () {
    this.$store.dispatch('checkAuthenticated')
    this.$store.commit('terminateLiked')
  },
  methods: {
    onClickThumbnail (image) {
      this.$store.dispatch('triggerSelfImageViewed', image)
    },
    onClickLike (image) {
      this.$store.dispatch('triggerSelfImageLiked', image)
    },
    onClickSave (image) {
      this.$store.dispatch('triggerSelfImageSaved', image)
    },
    async onFetchImages () {
      this.loadingNewImages = true
      let images = []
      if (this.likedImages && this.likedImages.length > 0) {
        images = await this.$store.dispatch('fetchLikedImages', this.likedImages[this.likedImages.length - 1].liked_at)
      } else {
        images = await this.$store.dispatch('fetchLikedImages', null)
      }
      this.imagesEnd = images.length === 0
      this.loadingNewImages = false
    }
  }
}
</script>
