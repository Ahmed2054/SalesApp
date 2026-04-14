// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

const { resolver: { sourceExts, assetExts } } = config;

config.resolver.sourceExts = ['ts', 'tsx', ...sourceExts, 'cjs'];

module.exports = config;
