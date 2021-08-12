# APK Classifier
Detect the platform of which an APK file was build on top.

![Example](https://raw.githubusercontent.com/LeandroSQ/APK-Classifier/master/.github/images/screenshot.png)
_Example of an .apk file built using Ionic_

## Platforms supported
| Platform | Supported | Presented as |
| -- | -- | -- |
| Android native | Supported | Native |
| React native | Supported | React native |
| Flutter | Supported | Flutter |
| Cordova | Supported | Cordova |
| Ionic | Supported | Cordova-like |
| Phonegap | Supported | Cordova-like |
| Framework7 | Supported | Cordova-like |

## Usage
### Using npx
- Run the script
  - For a single file: `npx @leandrosq/apk-classifier -f <FILE_PATH.apk>`
  - For multiple files: `npx @leandrosq/apk-classifier -d <DIRECTORY_PATH>`
### Running by the source
- Clone the repository
- Run `npm install` for installing the dependencies
- Run the script
  - For a single file: `node src/main.js -f <FILE_PATH.apk>` or `npm start -- -f <FILE_PATH.apk>`
  - For multiple files (Directory): `node src/main.js -d <DIRECTORY_PATH>` or `npm start -- -d <DIRECTORY_PATH>`