const fs = require('fs');
const path = require('path');

const dir = 'src/environments';
const file = 'environment.ts';
const prodFile = 'environment.prod.ts';

const content = `${process.env.ENV_FILE}`;

// Create environment files
fs.mkdir(dir, { recursive: true }, (e) => {
    if (e) throw e;

    fs.access(dir, fs.constants.F_OK, (err) => {
        try {
            fs.writeFileSync(dir + "/" + file, content);
            fs.writeFileSync(dir + "/" + prodFile, content);

            console.log('Environment files created', process.cwd());

            if (fs.existsSync(dir + "/" + file)) {
                console.log('Environment file created:', path.resolve(dir + '/' + file));
                fs.readFileSync(dir + '/' + file).toString();
            }
            if (fs.existsSync(dir + "/" + prodFile)) {
                console.log('Production environment file created:', path.resolve(dir + '/' + prodFile));
                fs.readFileSync(dir + '/' + prodFile).toString();
            }
        } catch (error) {
            console.log('Error creating environment files:', error);
            process.exit(1);
        }
    });
});

// Create GoogleService-Info.plist for iOS
if (process.env.PLIST_FILE) {
    const plistDir = 'ios/App/App';
    const plistFile = 'GoogleService-Info.plist';
    const plistPath = path.join(plistDir, plistFile);
    const plistContent = process.env.PLIST_FILE;

    try {
        // Ensure directory exists
        fs.mkdirSync(plistDir, { recursive: true });

        // Write the plist file
        fs.writeFileSync(plistPath, plistContent);

        console.log('GoogleService-Info.plist created:', path.resolve(plistPath));

        // Verify the file was created
        if (fs.existsSync(plistPath)) {
            console.log('GoogleService-Info.plist verified successfully');
        }
    } catch (error) {
        console.error('Error creating GoogleService-Info.plist:', error);
        process.exit(1);
    }
} else {
    console.warn('Warning: PLIST_FILE environment variable not set. Skipping GoogleService-Info.plist creation.');
}

// Create google-services.json for Android
if (process.env.GOOGLE_SERVICES_JSON) {
    const androidDir = 'android/app';
    const androidFile = 'google-services.json';
    const androidPath = path.join(androidDir, androidFile);
    const androidContent = process.env.GOOGLE_SERVICES_JSON;

    try {
        // Ensure directory exists
        fs.mkdirSync(androidDir, { recursive: true });

        // Write the google-services.json file
        fs.writeFileSync(androidPath, androidContent);

        console.log('google-services.json created:', path.resolve(androidPath));

        // Verify the file was created
        if (fs.existsSync(androidPath)) {
            console.log('google-services.json verified successfully');
        }
    } catch (error) {
        console.error('Error creating google-services.json:', error);
        process.exit(1);
    }
} else {
    console.warn('Warning: GOOGLE_SERVICES_JSON environment variable not set. Skipping google-services.json creation.');
}
