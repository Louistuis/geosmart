// GeoSmart: appended to GeoGebra's own preload.js by patch.sh.
// A narrow bridge for the page. The API key only goes in (when the user types
// it into Settings) and is never handed back to the page.
{
    const { contextBridge: gsBridge, ipcRenderer: gsIpc } = require('electron');
    gsBridge.exposeInMainWorld('geosmartHost', {
        getSettings: () => gsIpc.invoke('geosmart:getSettings'),
        setSettings: (partial) => gsIpc.invoke('geosmart:setSettings', partial),
        setKey: (key) => gsIpc.invoke('geosmart:setKey', key),
        clearKey: () => gsIpc.invoke('geosmart:clearKey'),
        testKey: (key) => gsIpc.invoke('geosmart:testKey', key),
        ask: (text, context) => gsIpc.invoke('geosmart:ask', { text, context }),
        stop: () => gsIpc.invoke('geosmart:stop'),
        newChat: () => gsIpc.invoke('geosmart:newChat'),
        openExternal: (url) => gsIpc.invoke('geosmart:openExternal', url),
        onEvent: (fn) => gsIpc.on('geosmart:event', (_e, ev) => fn(ev)),
        onMenu: (fn) => gsIpc.on('geosmart:menu', (_e, action) => fn(action)),
        testShot: (name) => gsIpc.invoke('geosmart:shot', name),
        testQuit: () => gsIpc.invoke('geosmart:quit'),
    });
}
