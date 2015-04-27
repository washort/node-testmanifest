var fs = require('fs');
var express = require('express');
var bodyParser = require('body-parser');
var logger = require('morgan');
var path = require('path');
var program = require('commander');
var mkdirp = require('mkdirp').sync;

function subdomainMiddle(req, res, next) {
    
    var hostParts = req.hostname.split(".");
    if(hostParts.length < 3 || hostParts[0] == "www") {
        res.locals.subdomain = 'remove';
    } else {
        req.url = "/subdomain/" + hostParts[0] + req.url;
        res.locals.subdomain = hostParts[0];
    }

    res.locals.subdomainBase = res.locals.subdomain.split('-')[0];
    res.locals.domain = "http://" + res.locals.subdomain + "." + hostnameRoot(req.hostname);
    res.locals.manifest = res.locals.domain + "/manifest.webapp";
    next();
}

function hostnameRoot(hostname) {
    return hostname.split('.').slice(-2).join('.');
}

function newManifest(domain) {
    var data = {
        'name': '{appname}',
        'description': 'This app has been automatically generated by ' + domain,
        'version': '1.0',
        'icons': {'16': "http://" + domain + '/icon-16.png',
                  '48': "http://" + domain + '/icon-48.png',
                  '128': "http://" + domain + '/icon-128.png'},
        'install_allowed_from': ['*'],
        'developer': {'name': 'Test Manifest User', 'url': 'http://testmanifest.com'}
    };
    return JSON.stringify(data, null, 4);
}

function unslugify(slug) {
    var first = slug.charAt(0).toUpperCase()
    var rest = slug.slice(1).replace(
            /[-|_](.)/g,
            function(match, group1) {
                return ' ' + group1.toUpperCase();
            });
    return first + rest;
}

function renderManifest(manifest, subdomain, isTestApp) {
    var name = null;
    if (isTestApp) {
        name = "Test App (" + subdomain + ")";
    } else {
        name = unslugify(subdomain);
    }
    return manifest.replace('{appname}', name);
}

function sanitizedFilename(type, name) {
    type = type.replace(/[^\w-]/g, "");
    name = name.replace(/[^\w-]/g, "");
    return path.join(__dirname, type, name);
}

function getManifest(names, domain, callback) {
    if (names.length === 0) {
        callback(null, newManifest(domain));
        return;
    }

    var name = names.pop();
    fs.readFile(sanitizedFilename('manifests', name), function(err, data) {
        if (err) {
            getManifest(names, domain, callback);
            return;
        }
        callback(err, data.toString());
    });
}

function putManifest(name, data, callback) {
    fs.writeFile(sanitizedFilename('manifests', name), data, callback);
}

function addManifest(req, res, next) {
    var possibleNames = [res.locals.subdomainBase];
    getManifest(possibleNames, req.hostname, function(err, data) {
        res.locals.manifestData = data;
        next();
    });
}

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(bodyParser.urlencoded({extended: false}));
app.use(subdomainMiddle);
app.use(logger('dev'));
app.get("/", function(req, res) {
    res.sendFile(__dirname + "/public/index.html");
});

app.get("/subdomain/:subdomain", addManifest, function(req, res) {
    res.sendFile(__dirname + "/public/edit.html");
});

app.post("/subdomain/:subdomain", function(req, res) {
    putManifest(res.locals.subdomainBase, req.body.manifest, function(err) {
        if (err) console.log(err);
    });
    res.redirect("/");
});

app.get("/subdomain/:subdomain/manifest.webapp", addManifest, function(req, res) {
    res.set('Content-Type', 'application/x-web-app-manifest+json');
    res.send(renderManifest(res.locals.manifestData, res.locals.subdomain, true));
});

app.get("/subdomain/:subdomain/fake-data/manifest.webapp", addManifest, function(req, res) {
    res.set('Content-Type', 'application/x-web-app-manifest+json');
    res.send(renderManifest(res.locals.manifestData, res.locals.subdomain, false));
});

app.get("/subdomain/:subdomain/manifest.raw", addManifest, function(req, res) {
    res.set('Content-Type', 'application/json; charset=utf-8');
    res.send(res.locals.manifestData);
});

app.use(express.static(__dirname + '/public'));
app.use('/subdomain/:subdomain', express.static(__dirname + '/public'));


program
    .option('-p, --port <port>', 'Bind Port', 3000, parseInt)
    .parse(process.argv);

mkdirp(path.join(__dirname, 'manifests'));
console.log("Listening on:", program.port);
app.listen(program.port);
