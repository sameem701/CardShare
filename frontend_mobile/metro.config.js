const path = require('path');
const { load } = require('@expo/env');
const { getDefaultConfig } = require('expo/metro-config');

load(path.resolve(__dirname, '..'));

module.exports = getDefaultConfig(__dirname);
