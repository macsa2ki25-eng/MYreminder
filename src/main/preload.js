'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);
const on = (channel) => (cb) => {
  const listener = (_e, ...args) => cb(...args);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('api', {
  add: invoke('item:add'),
  reassign: invoke('item:reassign'),
  done: invoke('item:done'),
  undone: invoke('item:undone'),
  remove: invoke('item:remove'),
  doneMany: invoke('item:doneMany'),
  getList: invoke('list:get'),

  getAlert: invoke('alert:get'),
  alertInteract: invoke('alert:interact'),
  alertReveal: invoke('alert:reveal'),
  alertClose: invoke('alert:close'),
  alertSnooze: invoke('alert:snooze'),

  closeInput: invoke('input:close'),
  openList: invoke('open:list'),
  openSettings: invoke('open:settings'),
  openInput: invoke('open:input'),

  getSettings: invoke('settings:get'),
  setSettings: invoke('settings:set'),
  openSettingsFile: invoke('settings:openFile'),
  newPhoneTopic: invoke('phone:newTopic'),
  testPhone: invoke('phone:test'),
  testDisplays: invoke('displays:test'),

  fabMove: invoke('fab:move'),
  fabMoved: invoke('fab:moved'),

  onRefresh: on('refresh'),
  onAlertUpdate: on('alert:update'),
  onInputFocus: on('input:focus'),
});
