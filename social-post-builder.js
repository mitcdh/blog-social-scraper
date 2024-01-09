const https = require('https');
const fs = require('fs');
const path = require('path');
const listAllVideos = require('./youtube-channel-scraper/youtube-channel-scraper');
const getAlbums = require('./flickr-album-scraper/flickr-album-scraper');

const CONTENT_DIR = path.join(__dirname, 'content');
const IMAGES_DIR = path.join(__dirname, 'static/images');

function sanitizeTitle(title) {
    return title.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();
}

function formatDate(dateString) {
    // Adjust for Flickr EXIF date format (YYYY:MM:DD HH:MM:SS)
    const correctedFormat = dateString.replace(/:/g, '-').slice(0, 10);
    const date = new Date(correctedFormat);

    // Formatting the date components
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    // Concatenating the formatted date string with the fixed timezone of +0000
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} +0000`;
}

async function downloadImage(url, filename, title) {
    if (url.includes('localhost')) {
        console.error(`Error: Localhost URL found for '${title}'. Image download skipped.`);
        return;
    }

    const imagePath = path.join(IMAGES_DIR, `${filename}.jpg`);

    if (fs.existsSync(imagePath)) {
        console.log(`Image already exists: ${filename}.jpg`);
        return;
    }

    try {
        const request = https.get(url, function(response) {
            if (response.statusCode === 200) {
                const fileStream = fs.createWriteStream(imagePath);
                response.pipe(fileStream);
                fileStream.on('finish', function() {
                    fileStream.close();
                    console.log('Downloaded image:', filename);
                });
            } else {
                console.log(`Error: Response status code ${response.statusCode} for image: ${url}`);
                response.resume(); // Consume response data to free up memory
            }
        });

        request.on('error', function(error) {
            console.error(`Error downloading image: ${url}`, error);
        });
    } catch (error) {
        console.error(`Error downloading image: ${url}`, error);
    }
}

function extractOriginalDate(description) {
    const regex = /Originally Published:\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \+\d{4})/m;
    const match = description.match(regex);
    return match ? match[1] : null;
}

function createHugoPost(title, description, date, embedUrl, tags) {
    const sanitizedTitle = sanitizeTitle(title);
    const filePath = path.join(CONTENT_DIR, `${sanitizedTitle}.md`);
    const imageFilename = `${sanitizedTitle}.jpg`;

    // Extract the original date if present in the description
    const originalDate = extractOriginalDate(description);
    const finalDate = originalDate ? originalDate : date;
    const descriptionWithoutOriginalDate = description.split('\n').filter(line => !line.includes('Originally Published')).join('\n');


    // Split the description into first line and remaining text
    const firstLine = descriptionWithoutOriginalDate.split('\n')[0];
    const remainingText = descriptionWithoutOriginalDate.substring(firstLine.length).trim();

    if (fs.existsSync(filePath)) {
        console.log(`Post already exists: ${sanitizedTitle}.md`);
        return;
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
}

async function main() {
    if (!fs.existsSync(CONTENT_DIR)) fs.mkdirSync(CONTENT_DIR, { recursive: true });
    if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

    try {
        const videos = await listAllVideos();
        console.log(videos);
        videos.forEach(video => {
            const formattedDate = formatDate(video.publishedAt);
            const sanitizedTitle = sanitizeTitle(video.title);
            downloadImage(video.thumbnailUrl, sanitizedTitle, video.title);
            createHugoPost(video.title, video.description, formattedDate, video.embedLink, ['Video']);
        });

        const albums = await getAlbums();
        console.log(albums);
        albums.forEach(album => {
            const formattedDate = formatDate(album.lastPhotoTimestamp);
            const albumTitle = album.title.replace(/^\d{4}-\d{2}\s*/, '');
            const sanitizedTitle = sanitizeTitle(albumTitle);
            downloadImage(album.featureImageUrl, sanitizedTitle, album.title);
            createHugoPost(albumTitle, album.description, formattedDate, album.link, ['Album'], '');
        });
    } catch (error) {
        console.error('Error in main:', error);
    }
}

main();
