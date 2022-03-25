/*!
 * express-responsive-images
 * Copyright(c) 2022 Murat Motz
 * MIT Licensed
 * https://github.com/ztomm/express-responsive-images
 */

/*!
 * express-better-responsive-images
 * Copyright(c) 2022 ServOKio
 * MIT Licensed
 * https://github.com/servokio/express-better-responsive-images
 */

'use strict'

/**
 * Module dependencies
 * @private
 */

const
    fs = require('fs'),
    path = require('path'),
    sharp = require('sharp');

/**
 * Module variables
 * @private
 */

const moduleName = 'express-better-responsive-images';

/**
 * Module
 */

module.exports = (opts = {}) => {
    const options = {
        staticDir: '',
        watchedDirectories: ['/images'],
        fileTypes: ['webp', 'jpg', 'jpeg', 'png', 'gif'],
        fileTypeConversion: '',
        cacheSuffix: '-cache',
        cookieName: 'screen',
        scaleBy: 'breakpoint',
        breakpoints: [320, 480, 640, 800, 1024, 1280, 1366, 1440, 1600, 1920, 2048, 2560, 3440, 4096],
        directScaling: false,
        directScalingParam: 'w',
        directScaleSizes: [],
        convetableFileTypes: [],
        convetableParam: 'as',
        customLibvips: false,
        saveWithMetadata: true,
        ignoreCookieErrorMethod: 0,
        debug: false,
        ...opts
    }

    const debug = (level, message) => options.debug && console.log(`\x1b[90m[\x1b[37m${moduleName}\x1b[90m] \x1b[90m[\x1b[37m${level === 'error' ? '\x1b[91mERROR' : level === 'warn' ? '\x1b[93mWARN' : '\x1b[94mINFO'}\x1b[90m] \x1b[37m${message}`);

    return (req, res, next) => {

        // declare requested url parts
        const urlObj = new URL('http://localhost:80' + req.url);
        const requestUrl = urlObj.pathname;               // e.g. /media/subdir/image.jpg
        const requestPath = path.dirname(requestUrl);     // e.g. /media/subdir
        const
            requestFileName = requestUrl.split('/').pop().replace(/\.[^/.]+$/, ""), // e.g. image
            requestQueryW = parseInt(urlObj.searchParams.get(options.directScalingParam)) || 0, //e.g. 64 for example
            requestQueryAs = urlObj.searchParams.get(options.convetableParam)?.toLowerCase() || null;

        debug('info', `${req.url} --------------------------------------`);

        //Check dir
        if (!options.watchedDirectories.length) {
            debug('warn', `(${requestFileName}) there is not any directory specified to watch!`);
            return next();
        }

        // ls requested path in list of watching directories ?
        let validPath = false
        for (let dir of options.watchedDirectories) {
            // wildcards in pattern
            if (dir.includes('*')) dir = dir.replace(/\*/g, '[^/].*');
            if (new RegExp('^' + dir + '$').test(requestPath)) {
                validPath = true;
                debug('info', `(${requestFileName}) requested directory is in watchlist: ${requestPath}`);
                break;
            }
        }
        if (!validPath) {
            // request is something else, get out of this module !
            debug('warn', `(${requestFileName}) requested directory is not in watchlist: ${requestPath}`);
            return next();
        }

        debug('info', `(${requestFileName}) requested file: ${requestFileName}`);

        // declare some vars
        let newImageWidth = 1;
        const
            originFilePath = path.join(process.cwd(), options.staticDir + requestUrl),
            reqFileType = requestUrl.split('/').pop().split('.').pop()  // e.g. '.jpg'
        let
            newFileType = '',
            newFilePath = '',
            cacheFilePath = '',
            cacheFileWidth = 0,
            cacheDirPath = path.join(process.cwd(), options.staticDir + path.dirname(requestUrl) + options.cacheSuffix),
            deviceParameters = [],
            imageMetadata = {},
            image = null;

        // is filetype supported ?
        options.fileTypes = options.fileTypes.map(x => x.toLowerCase());
        if (options.fileTypes.includes(reqFileType.toLowerCase())) {
            debug('info', `(${requestFileName}) filetype is supported: ${reqFileType}`);
        } else {
            debug('warn', `(${requestFileName}) filetype is not supported: ${reqFileType}`);
            return next();
        }

        //Does origin image exists ?
        if (!fs.existsSync(originFilePath)) {
            debug('warn', `(${requestFileName}) origin image does not exists`);
            return next();
        }

        //Change requested url and return
        const sendCachedFile = _ => {
            req.url = newFilePath;
            debug('info', `(${requestFileName}) requested url updated to ${req.url}`);
            return next();
        }

        //Create scaled image
        const createCacheFile = _ => {
            // create directory if needed
            try {
                if (!fs.existsSync(cacheDirPath)) fs.mkdirSync(cacheDirPath, { recursive: true });
                //Check if animated
                if (options.customLibvips && imageMetadata.pages > 0) image = sharp(originFilePath, { animated: true });
                image.resize(cacheFileWidth);
                (options.saveWithMetadata ? image.withMetadata() : image).toFile(cacheFilePath, (err, info) => {
                    if (err) {
                        debug('error', `(${requestFileName}) sharp faild to create file: ${err.message}`);
                        return next();
                    } else {
                        debug('info', `(${requestFileName}) image scaled and created: ${cacheFilePath}`);
                        return sendCachedFile();
                    }
                });
            } catch (e) {
                debug('error', `(${requestFileName}) failed to create caching directory: ${cacheDirPath}: ${e.message}`);
                return next();
            }
        }

        // lookup image in cache / delete outdated / create it / send it
        const prepareResponse = _ => {
            if (fs.existsSync(cacheFilePath)) {
                if (fs.statSync(originFilePath).mtime.getTime() > fs.statSync(cacheFilePath).mtime.getTime()) {
                    debug('warn', `(${requestFileName}) cached image is stale and will be removed: ${cacheFilePath}`);
                    // origin image was modified, delete cached image,
                    fs.unlinkSync(cacheFilePath);
                    // create it again, send it
                    return createCacheFile();
                }
                else {
                    // cached image exists, send it
                    debug('info', `(${requestFileName}) requested image is in cache: ${cacheFilePath}`);
                    return sendCachedFile();
                }
            }
            // cached image does not exists, create and send it
            debug('warn', `(${requestFileName}) requested image is not in cache: ${cacheFilePath}`);
            return createCacheFile();
        }

        // now let's check file
        sharp.cache(false);
        image = sharp(originFilePath);
        image.metadata((err, meta) => {
            if(err){
                debug('error', `(${originFilePath}) error receiving metadata: ${err.message}`);
                return next();
            }
            imageMetadata = meta;
            debug('info', `(${requestFileName}) meta loaded`);
            //all ok
            //let's check cookies
            let cookieError = false;
            if (req.headers.cookie) {
                const cookies = req.headers.cookie + ';'
                deviceParameters = cookies.match(new RegExp(`(^|;| )${options.cookieName}=([^,]+),([^;]+)`)) || []
                // deviceParameters[2] = density, deviceParameters[3] = width
                if (!deviceParameters.length) {
                    debug('warn', `(${requestFileName}) cookies sent but module cookie not found`);
                    cookieError = true;
                }
            } else {
                debug('error', `(${requestFileName}) no cookie in headers`);
                cookieError = true;
            }

            // no cookies sent or module cookie not found
            if (!cookieError || !deviceParameters.length) {
                // take care for directScaling is active and cookie is missing
                if (options.directScaling && requestQueryW > 0 && options.ignoreCookieErrorMethod === 1) {
                    deviceParameters[2] = 1; // guess density
                    deviceParameters[3] = 1; // dummy value
                    debug('warn', `(${requestFileName}) no cookies sent but directScaling is active. 1 method of ignoring is used.`);
                } else debug('warn', `(${requestFileName}) ${requestQueryW > 0 ? 'no cookies was found and ignore method is disabled' : 'no cookies was found and the requesting width is not specified'}`);
            }

            if (deviceParameters.length) {
                // calculate new image width
                newImageWidth = Math.round(deviceParameters[2] * deviceParameters[3]);
                debug('info', `(${requestFileName}) cookie "${options.cookieName}" is set: density=${deviceParameters[2]}, width=${deviceParameters[3]}`)
            } else {
                debug('error', `(${requestFileName}) deviceParameters not set`)
                return next()
            }

            // check for directScaling
            let directScale = false
            if (options.directScaling && requestQueryW > 0) {
                if (!options.directScaleSizes.length || (options.directScaleSizes.length && options.directScaleSizes.includes(requestQueryW))) {
                    // calculate new image width
                    newImageWidth = Math.round(requestQueryW * deviceParameters[2])
                    directScale = true;
                } else {
                    debug('warn', `(${requestFileName}) image size not listed in directScaleSizes: ${requestQueryW}`)
                    return next();
                }
            }

            if (!options.directScaling && requestQueryW > 0) debug('warn', `(${requestFileName}) direct scaling is not enabled`);


            // be sure new image width is a legal number
            if (typeof newImageWidth !== 'number' || isNaN(newImageWidth) || newImageWidth < 1) {
                debug('error', `(${requestFileName}) calculated image width is not a legal number`);
                return next();
            }

            debug('info', `(${requestFileName}) new image width is probably ${newImageWidth}`);

            // convert filetypes
            let fileTypeConversion = false
            if (options.fileTypeConversion !== '' && options.fileTypeConversion !== reqFileType) {
                fileTypeConversion = true
                // check if client accepts webp
                if (options.fileTypeConversion === 'webp' && !req.headers.accept?.includes('image/webp')) {
                    debug('warn', `(${requestFileName}) filetype "webp" is not accepted by client`);
                    fileTypeConversion = false
                }
                // set new filetype
                if (fileTypeConversion) {
                    newFileType = `.${options.fileTypeConversion}`;
                    debug('info', `(${requestFileName}) new filetype will be: ${newFileType}`);
                }
            }

            if (requestQueryAs !== null && reqFileType !== requestQueryAs && options.convetableFileTypes.includes(requestQueryAs)) {
                fileTypeConversion = true
                // set new filetype
                newFileType = `.${requestQueryAs}`;
                debug('info', `(${requestFileName}) new filetype will be: ${requestQueryAs}`);
            }

            // return if image is smaller than newImageWidth
            if (newImageWidth >= imageMetadata.width) {
                debug('warn', `(${requestFileName}) origin image is smaller than new image width`);
                // if fileTypeConversion
                if (fileTypeConversion) {
                    debug('warn', `(${requestFileName}) preparing fileTypeConversion`);
                    cacheFilePath = path.join(cacheDirPath, requestFileName + newFileType);
                    cacheFileWidth = imageMetadata.width;
                    newFilePath = path.dirname(requestUrl) + options.cacheSuffix + '/' + requestFileName + newFileType;
                    return prepareResponse();
                } else {
                    return next();
                }
            }

            if (directScale) {  // direct scaling
                debug('info', `(${requestFileName}) scale by: directScale`);
                cacheFileWidth = newImageWidth
            } else if (options.scaleBy === 'viewport') { // scaleBy viewport
                debug('info', `(${requestFileName}) scale by: viewport`);
                cacheFileWidth = newImageWidth;
            } else if (options.scaleBy === 'breakpoint') { // scaleBy breakpoint
                debug('info', `(${requestFileName}) scale by: breakpoint`);
                const breakpointMax = Math.max(...options.breakpoints);
                // breakpoints in ascending order
                options.breakpoints = options.breakpoints.sort((a, b) => a - b)
                // check if device is greater than highest breakpoint
                if (newImageWidth > breakpointMax) {
                    debug('warn', `(${requestFileName}) highest breakpoint (${breakpointMax}) is smaller than new image width (${newImageWidth})`);
                    return next();
                } else {
                    // take the matching breakpoint or the next higher one
                    cacheFileWidth = options.breakpoints.find(e => { return e >= newImageWidth });
                    // if cacheFileWidth is undefined get out
                    if (!cacheFileWidth) {
                        debug('error', `(${requestFileName}) cacheFileWidth is undefined, can't define a breakpoint`);
                        return next();
                    }
                }
            }

            debug('info', `(${requestFileName}) image width should be: ${cacheFileWidth}`);

            // cache directory
            cacheDirPath = path.join(cacheDirPath, cacheFileWidth.toString())
            debug('info', `(${requestFileName}) cache directory: ${cacheDirPath}`);

            // path to file in cache
            cacheFilePath = path.join(cacheDirPath, requestFileName + newFileType);

            newFilePath = path.dirname(requestUrl) + options.cacheSuffix + '/' + cacheFileWidth.toString() + '/' + requestFileName + newFileType;
            return prepareResponse();
        });
    }
}
