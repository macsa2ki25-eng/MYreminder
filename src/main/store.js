'use strict';

const fs = require('fs');
const path = require('path');
const { DEFAULT_SETTINGS, mergeSettings } = require('../core/defaults');

function readJson(p) {
  // メモ帳で保存すると先頭にBOMがつくことがある
  const text = fs.readFileSync(p, 'utf8').replace(/^﻿/, '');
  return JSON.parse(text);
}

function writeJson(p, obj) {
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, p);
}

function createStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const dataPath = path.join(dir, 'data.json');
  const settingsPath = path.join(dir, 'settings.json');
  const logPath = path.join(dir, 'log.txt');

  function loadData() {
    const empty = { version: 1, items: [], fired: { date: '', ids: [] }, morningAt: null, alertCount: 0 };
    if (!fs.existsSync(dataPath)) return empty;
    try {
      return { ...empty, ...readJson(dataPath) };
    } catch (err) {
      // 壊れていたら退避して空から始める（元のファイルは残す）
      fs.copyFileSync(dataPath, `${dataPath}.broken-${Date.now()}`);
      log(`data.json を読めませんでした: ${err.message}`);
      return empty;
    }
  }

  function saveData(data) {
    writeJson(dataPath, data);
  }

  /** { settings, error } — 書き方に誤りがあれば error に理由が入り、settings は null */
  function loadSettings() {
    if (!fs.existsSync(settingsPath)) {
      writeJson(settingsPath, DEFAULT_SETTINGS);
      return { settings: mergeSettings(DEFAULT_SETTINGS), error: null };
    }
    try {
      return { settings: mergeSettings(readJson(settingsPath)), error: null };
    } catch (err) {
      return { settings: null, error: err.message };
    }
  }

  function saveSettings(settings) {
    writeJson(settingsPath, settings);
  }

  function log(message) {
    try {
      const line = `${new Date().toISOString()} ${message}\n`;
      if (fs.existsSync(logPath) && fs.statSync(logPath).size > 512 * 1024) fs.renameSync(logPath, `${logPath}.old`);
      fs.appendFileSync(logPath, line, 'utf8');
    } catch {
      // ログが書けなくても本体は動かす
    }
  }

  return { dir, dataPath, settingsPath, loadData, saveData, loadSettings, saveSettings, log };
}

module.exports = { createStore };
