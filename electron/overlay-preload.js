// The pill page's only powers: hand its text up, ask to be hidden, learn when it was shown.
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlay', {
  submit: (text) => ipcRenderer.send('overlay:submit', String(text || '')),
  dismiss: () => ipcRenderer.send('overlay:dismiss'),
  onShown: (cb) => { ipcRenderer.on('overlay:shown', () => cb()); },
});
