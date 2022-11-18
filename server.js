const fs = require('fs');
const path = require('path');

const dir = 'src/environments';
const manifestDir = 'src';
const file = 'environment.ts';
const prodFile = 'environment.prod.ts';
const manifestFile = 'manifest.webmanifest';

const content = `${process.env.ENV_FILE}`;
const content = `${process.env.MANIFEST}`;

fs.mkdir(dir, { recursive: true }, (e) => {
    if (e) throw e;

    fs.access(dir, fs.constants.F_OK, (err) => {
        try {
            fs.writeFileSync(dir + "/" + file, content);
            fs.writeFileSync(dir + "/" + prodFile, content);

            console.log('file created', process.cwd());

            if (fs.existsSync(dir + "/" + file)) {
                console.log('file is created', path.resolve(dir + '/' + file));

                const str = fs.readFileSync(dir + '/' + file).toString();

                console.log(str);
            }
            if (fs.existsSync(dir + "/" + prodFile)) {
                console.log('file is created', path.resolve(dir + '/' + prodFile));

                const str = fs.readFileSync(dir + '/' + prodFile).toString();

                console.log(str);
            }
        } catch (error) {
            console.log(error);
            process.exit(1);
        }
    });
});

fs.access(dir, fs.constants.F_OK, (err) => {
    try {
        fs.writeFileSync(dir + "/" + manifestFile, content);

        console.log('file created', process.cwd());

        if (fs.existsSync(dir + "/" + manifestFile)) {
            console.log('file is created', path.resolve(dir + '/' + manifestFile));

            const str = fs.readFileSync(dir + '/' + manifestFile).toString();

            console.log(str);
        }
    } catch (error) {
        console.log(error);
        process.exit(1);
    }
});
