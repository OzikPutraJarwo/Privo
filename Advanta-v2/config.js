const CLIENT_ID = '400272927751-t5ehe632lahuk9p38eie583tv2obv60s.apps.googleusercontent.com';
const API_KEY = 'AIzaSyACgQqP_f8cohSUMTJEN2CbKwiNvQN2E7Y';

const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile';

const APP_CONFIG = {
    folderName: 'Advanta-WebApp',
    inventoryFile: 'inventory.json',
    trialsFolder: 'trials',
    photosFolder: 'photos'
};

const DEFAULT_INVENTORY = {
    crops: [],
    lines: [],
    locations: [],
    params: []
};