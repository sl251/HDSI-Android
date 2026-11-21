import './preview-demo'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor, registerPlugin } from '@capacitor/core'
import type { NativeBridge } from '../../packages/contracts'
import './style.css'
import { App } from './App'
import './glass.css'
import './experience.css'

const bridge = registerPlugin<NativeBridge>('HdsRuntime')
createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App bridge={bridge} native={Capacitor.isNativePlatform()} /></React.StrictMode>,
)
