import Vue from 'vue'
import App from './App.vue'
import router from './router'
import './registerServiceWorker'
import i18n from './i18n'

import VueClipboards from 'vue-clipboards'
import Vuex from 'vuex'
import VueMaterial from 'vue-material'
import VueQRCodeComponent from 'vue-qrcode-component'
import VueHazeServerApi from './lib/adamantServerApi'
import VueFormatters from './lib/formatters'
import 'vue-material/dist/vue-material.css'
import 'material-design-icons-iconfont/dist/material-design-icons.css'
import packageJSON from '../package.json'
import storeConfig from './store'

Vue.use(Vuex)
Vue.use(VueMaterial)
Vue.use(VueClipboards)
Vue.use(VueHazeServerApi)
Vue.use(VueFormatters)
Vue.component('qr-code', VueQRCodeComponent)

const store = new Vuex.Store(storeConfig)
document.title = i18n.t('app_title')

Vue.config.productionTip = false

window.ep = new Vue({
  version: packageJSON.version,
  router,
  store,
  template: '<App/>',
  components: { App },
  i18n,
  render: h => h(App)
}).$mount('#app')
