export { resolvePaths, paths, type Platform, type AirPaths } from './paths';
export { loadConfig, validateConfigFile, migrateConfig, type LoadOptions } from './loader';
export { CONFIG_VERSION, DEFAULT_CONFIG, ConfigSchema, StrictConfigSchema, parseConfig, safeParseConfig, formatConfigError, type Config, type ToolConfig, } from './schema';
