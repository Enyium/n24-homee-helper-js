import os from "os";
import url from "url";
import path from "path";
import fs from "fs/promises";
import { npmPackage } from "./util.js";

const configDirName = `.${npmPackage.name}`;
const configDirPath = path.join(os.homedir(), configDirName);
const configFilePath = path.join(configDirPath, "config.cjs");
export const configFileDisplayPath = `~/${configDirName}/config.cjs`;

export async function loadConfig() {
    await initConfig();
    return (await import(url.pathToFileURL(configFilePath))).default;
}

async function initConfig() {
    const scriptDir = path.dirname(url.fileURLToPath(import.meta.url));
    const defaultConfigPath = path.join(scriptDir, "default-config.cjs");

    for (const mkdir of [true, false]) {
        try {
            if (mkdir) {
                await fs.mkdir(configDirPath);
            } else {
                await fs.copyFile(defaultConfigPath, configFilePath, fs.constants.COPYFILE_EXCL);
            }
        } catch (error) {
            if (error.code !== "EEXIST") {
                throw error;
            }
        }
    }
}
