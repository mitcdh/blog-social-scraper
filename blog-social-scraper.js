const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
try {
    require('dotenv').config();
  } catch (error) {
    console.warn("dotenv is not available. Continuing without loading environment variables from .env file.");
}

const listAllVideos = require('./youtube-channel-scraper/youtube-channel-scraper');
const getAlbums = require('./flickr-album-scraper/flickr-album-scraper');

const CONTENT_DIR = path.join(process.cwd(), 'content/posts');
const IMAGES_DIR = path.join(process.cwd(), 'static/images');

function listDirectoryFiles(directory) {
    try {
        return fs.readdirSync(directory).map(file => path.join(directory, file));
    } catch (error) {
        console.error(`Error listing files in directory: ${directory}`, error);
        return [];
    }
}

function sanitizeTitle(title) {
    return title.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();
}

function formatDate(dateString) {
    const correctedFormat = dateString.replace(/:/g, '-').slice(0, 10);
    const date = new Date(correctedFormat);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')} +0000`;
}

async function downloadImage(url, filename, title) {
    const imagePath = path.join(IMAGES_DIR, `${filename}.jpg`);

    if (url.includes('localhost')) {
        console.error(`Error: Localhost URL found for '${title}'. Image download skipped.`);
        return { downloaded: false, imagePath };
    }

    if (fs.existsSync(imagePath)) {
        return { downloaded: false, imagePath };
    }

    const maxRetries = 3;
    let currentRetry = 0;
    const retryableStatusCodes = [429, 500, 502, 503, 504];
    const retryTimeout = 5000;

    while (currentRetry < maxRetries) {
        try {
            const response = await downloadWithRedirects(url);

            if (response.statusCode === 200) {
                await streamToFile(response, imagePath);
                if (fs.existsSync(imagePath)) {
                    return { downloaded: true, imagePath };
                } else {
                    throw new Error('File was not saved correctly.');
                }
            } else {
                throw new Error(`Response status code ${response.statusCode}`);
            }
        } catch (error) {
            const isRetryableError = retryableStatusCodes.includes(error.statusCode) || error.message.includes('ETIMEDOUT') || error.message.includes('ECONNRESET');
            if (currentRetry < maxRetries - 1 && isRetryableError) {
                console.error(`Error: downloading image ${url} with status code ${error.statusCode}. Retrying...`);
                currentRetry++;
                await new Promise(resolve => setTimeout(resolve, retryTimeout)); // Wait for 5 seconds before retrying
            } else {
                console.error(`Error: downloading image ${url}`, error);
                return { downloaded: false, imagePath };
            }
        }
    }
}


function downloadWithRedirects(url) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, function(response) {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                resolve(downloadWithRedirects(response.headers.location));
            } else if (response.statusCode === 200) {
                resolve(response);
            } else {
                reject(new Error(`Response status code ${response.statusCode}`));
            }
        });

        request.on('error', (error) => reject(error));
    });
}

function streamToFile(stream, filePath) {
    return new Promise((resolve, reject) => {
        const fileStream = fs.createWriteStream(filePath);
        stream.pipe(fileStream);
        fileStream.on('finish', () => resolve());
        fileStream.on('error', reject);
    });
}

function createHugoPost(title, description, date, embedUrl, tags) {
    const sanitizedTitle = sanitizeTitle(title);
    const filePath = path.join(CONTENT_DIR, `${sanitizedTitle}.md`);
    const imageFilename = `${sanitizedTitle}.jpg`;

    const originalDate = extractOriginalDate(description);
    const finalDate = originalDate ? originalDate : date;
    const descriptionWithoutOriginalDate = description.split('\n').filter(line => !line.includes('Originally Published')).join('\n');

    const firstLine = descriptionWithoutOriginalDate.split('\n')[0];
    const remainingText = descriptionWithoutOriginalDate.substring(firstLine.length).trim();

    if (fs.existsSync(filePath)) {
        return { created: false, filePath };
    }

    const content = `---
title: ${title}
description: "${firstLine}"
date: ${finalDate}
${tags.includes('Video') ? 'video_embed' : 'flickr_embed'}: '${embedUrl}'
image: '/images/${imageFilename}'
tags: [${tags.join(', ')}]
---

${remainingText}`;

    fs.writeFileSync(filePath, content);
    return { created: true, filePath };
}

function extractOriginalDate(description) {
    const regex = /Originally Published:\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \+\d{4})/m;
    const match = description.match(regex);
    return match ? match[1] : null;
}

async function main() {
    if (!fs.existsSync(CONTENT_DIR)) fs.mkdirSync(CONTENT_DIR, { recursive: true });
    if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

    let postsInfo = [];
    let buildOutput = { stdout: '', stderr: '', exitCode: null };

    try {
        const videos = await listAllVideos();
        for (const video of videos) {
            const formattedDate = formatDate(video.publishedAt);
            const sanitizedTitle = sanitizeTitle(video.title);

            const imageResult = await downloadImage(video.thumbnailUrl, sanitizedTitle, video.title);
            const postResult = createHugoPost(video.title, video.description, formattedDate, video.embedLink, ['Video']);

            postsInfo.push({
                title: video.title,
                timestamp: formattedDate,
                markdownFilePath: postResult.filePath,
                imageFilePath: imageResult.imagePath,
                imageDownloaded: imageResult.downloaded,
                postCreated: postResult.created,
                sourceScraper: 'youtube-channel-scraper'
            });
        }

        const albums = await getAlbums();
        for (const album of albums) {
            if (!album.title.startsWith('#') && !album.title.startsWith('@')) {
                const formattedDate = formatDate(album.lastPhotoTimestamp);
                const albumTitle = album.title.replace(/^\d{4}-\d{2}\s*/, '');
                const sanitizedTitle = sanitizeTitle(albumTitle);

                const imageResult = await downloadImage(album.featureImageUrl, sanitizedTitle, album.title);
                const postResult = createHugoPost(albumTitle, album.description, formattedDate, album.link, ['Album']);

                postsInfo.push({
                  title: albumTitle,
                  timestamp: formattedDate,
                  markdownFilePath: postResult.filePath,
                  imageFilePath: imageResult.imagePath,
                  imageDownloaded: imageResult.downloaded,
                  postCreated: postResult.created,
                  sourceScraper: 'flickr-album-scraper'
                });
            }
        }
    } catch (error) {
        console.error('Error in main:', error);
    }

    const contentFiles = listDirectoryFiles(CONTENT_DIR);
    const imageFiles = listDirectoryFiles(IMAGES_DIR);

    // Execute BUILD_COMMAND and capture output
    if (process.env.BUILD_COMMAND) {
        const buildProcess = exec(process.env.BUILD_COMMAND, (error, stdout, stderr) => {
            buildOutput.stdout = stdout;
            buildOutput.stderr = stderr;
            buildOutput.exitCode = error ? error.code : 0;

            // Log the final output including build command results
            console.log(JSON.stringify({ postsInfo, contentFiles, imageFiles, buildOutput }, null, 2));
        });
    } else {
        // Log the output if there is no build command
        console.log(JSON.stringify({ postsInfo, contentFiles, imageFiles }, null, 2));
    }
}

main();
