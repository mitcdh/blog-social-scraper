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
const getLetterboxdReviews = require('./letterboxd-review-scraper/letterboxd-review-scraper');
const getHardcoverReviews = require('./hardcover-review-scraper/hardcover-review-scraper');

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
    const monthNumbers = {
        Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
        Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
    };
    const rfcMatch = String(dateString).match(/^[A-Za-z]{3},\s+(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s+([+-]\d{4})$/);
    if (rfcMatch && monthNumbers[rfcMatch[2]]) {
        const [, day, month, year, hour, minute, second, offset] = rfcMatch;
        return `${year}-${monthNumbers[month]}-${day.padStart(2, '0')} ${hour}:${minute}:${second} ${offset}`;
    }

    const isoMatch = String(dateString).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/);
    if (isoMatch) {
        const [, year, month, day, hour, minute, second, rawOffset] = isoMatch;
        const offset = !rawOffset || rawOffset === 'Z' ? '+0000' : rawOffset.replace(':', '');
        return `${year}-${month}-${day} ${hour}:${minute}:${second} ${offset}`;
    }

    const dateOnlyMatch = String(dateString).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnlyMatch) {
        return `${dateOnlyMatch[1]}-${dateOnlyMatch[2]}-${dateOnlyMatch[3]} 00:00:00 +0000`;
    }

    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
        throw new Error(`Invalid date: ${dateString}`);
    }

    return date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' +0000');
}

async function downloadImage(url, filename, title) {
    const imagePath = path.join(IMAGES_DIR, `${filename}.jpg`);

    if (!url) {
        console.error(`Error: No image URL found for '${title}'. Image download skipped.`);
        return { downloaded: false, available: fs.existsSync(imagePath), imagePath };
    }

    if (url.includes('localhost')) {
        console.error(`Error: Localhost URL found for '${title}'. Image download skipped.`);
        return { downloaded: false, available: fs.existsSync(imagePath), imagePath };
    }

    if (fs.existsSync(imagePath)) {
        return { downloaded: false, available: true, imagePath };
    }

    const maxRetries = 3;
    let currentRetry = 0;
    const retryableStatusCodes = [429, 500, 502, 503, 504];
    const retryTimeout = 5000;

    while (currentRetry < maxRetries) {
        try {
            const response = await downloadWithRedirects(url);

            if (response.statusCode === 200) {
                const contentType = response.headers['content-type'] || '';
                if (!contentType.toLowerCase().startsWith('image/')) {
                    response.resume();
                    throw new Error(`Unexpected image content type: ${contentType || 'unknown'}`);
                }

                await streamToFile(response, imagePath);
                if (fs.existsSync(imagePath)) {
                    return { downloaded: true, available: true, imagePath };
                } else {
                    throw new Error('File was not saved correctly.');
                }
            } else {
                throw new Error(`Response status code ${response.statusCode}`);
            }
        } catch (error) {
            const isRetryableError = retryableStatusCodes.includes(error.statusCode) || error.message.includes('ETIMEDOUT') || error.message.includes('ECONNRESET') || error.message.includes('timed out');
            if (currentRetry < maxRetries - 1 && isRetryableError) {
                console.error(`Error: downloading image ${url} with status code ${error.statusCode}. Retrying...`);
                currentRetry++;
                await new Promise(resolve => setTimeout(resolve, retryTimeout)); // Wait for 5 seconds before retrying
            } else {
                console.error(`Error: downloading image ${url}`, error);
                return { downloaded: false, available: fs.existsSync(imagePath), imagePath };
            }
        }
    }
}


function downloadWithRedirects(url, redirectCount = 0) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, function(response) {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                response.resume();
                if (redirectCount >= 5) {
                    reject(new Error(`Too many redirects while downloading ${url}`));
                    return;
                }

                resolve(downloadWithRedirects(new URL(response.headers.location, url).toString(), redirectCount + 1));
            } else if (response.statusCode === 200) {
                resolve(response);
            } else {
                response.resume();
                const error = new Error(`Response status code ${response.statusCode}`);
                error.statusCode = response.statusCode;
                reject(error);
            }
        });

        request.setTimeout(30000, () => request.destroy(new Error('Image request timed out')));
        request.on('error', (error) => reject(error));
    });
}

function streamToFile(stream, filePath) {
    return new Promise((resolve, reject) => {
        const temporaryPath = `${filePath}.part`;
        const fileStream = fs.createWriteStream(temporaryPath);
        let settled = false;

        const cleanUp = error => {
            if (settled) return;
            settled = true;
            fs.rm(temporaryPath, { force: true }, () => reject(error));
        };

        stream.pipe(fileStream);
        stream.on('error', cleanUp);
        fileStream.on('error', cleanUp);
        fileStream.on('finish', () => {
            if (settled) return;
            fileStream.close(error => {
                if (settled) return;
                if (error) {
                    cleanUp(error);
                    return;
                }

                fs.rename(temporaryPath, filePath, renameError => {
                    if (renameError) {
                        cleanUp(renameError);
                        return;
                    }
                    settled = true;
                    resolve();
                });
            });
        });
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
title: ${JSON.stringify(title)}
description: ${JSON.stringify(firstLine)}
date: ${finalDate}
${tags.includes('Video') ? 'video_embed' : 'flickr_embed'}: ${JSON.stringify(embedUrl)}
image: ${JSON.stringify(`/images/${imageFilename}`)}
tags: ${JSON.stringify(tags)}
---

${remainingText}`;

    fs.writeFileSync(filePath, content);
    return { created: true, filePath };
}

function createExcerpt(markdown, maxLength = 180) {
    const plainText = String(markdown || '')
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/[*_`>#~]/g, '')
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (plainText.length <= maxLength) {
        return plainText;
    }

    const shortened = plainText.slice(0, maxLength + 1);
    const lastSpace = shortened.lastIndexOf(' ');
    return `${shortened.slice(0, lastSpace > 0 ? lastSpace : maxLength).trim()}…`;
}

function reviewSlug(review, sourceKey) {
    let datePart = 'undated';
    try {
        datePart = formatDate(review.reviewDate).slice(0, 10);
    } catch (error) {
        // Keep the review importable with a stable fallback when a source omits its date.
    }
    const typePart = sourceKey === 'letterboxd' ? 'film-review' : 'book-review';
    return sanitizeTitle(`${review.title}-${datePart}-${typePart}`) || `${sourceKey}-${review.id}`;
}

function createReviewPost(review, sourceKey, sourceLabel, options = {}) {
    const contentDir = options.contentDir || CONTENT_DIR;
    const slug = reviewSlug(review, sourceKey);
    const filePath = path.join(contentDir, `${slug}.md`);
    const imageFilename = `${slug}.jpg`;
    const displayTitle = sourceKey === 'letterboxd' && review.year
        ? `${review.title} (${review.year})`
        : review.title;
    const tags = sourceKey === 'letterboxd' ? ['Review', 'Film'] : ['Review', 'Book'];

    if (fs.existsSync(filePath)) {
        return { created: false, filePath, slug };
    }

    const ratingDescription = review.rating ? `Rating: ${review.rating}/5` : 'Unrated';
    const content = `---
title: ${JSON.stringify(displayTitle)}
description: ${JSON.stringify(ratingDescription)}
date: ${formatDate(review.reviewDate)}
image: ${JSON.stringify(`/images/${imageFilename}`)}
tags: ${JSON.stringify(tags)}
review_source: ${JSON.stringify(sourceKey)}
review_url: ${JSON.stringify(review.link)}
---

${review.review}

[View this review on ${sourceLabel}](${review.link})
`;

    fs.writeFileSync(filePath, content);
    return { created: true, filePath, slug };
}

function extractOriginalDate(description) {
    const regex = /Originally Published:\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \+\d{4})/m;
    const match = description.match(regex);
    return match ? match[1] : null;
}

async function runConfiguredScraper(name, requiredVariables, action, scraperErrors) {
    const missingVariables = requiredVariables.filter(variable => !process.env[variable]);
    if (missingVariables.length) {
        console.warn(`Skipping ${name}: missing ${missingVariables.join(', ')}`);
        return;
    }

    try {
        await action();
    } catch (error) {
        console.error(`${name} failed:`, error);
        scraperErrors.push({ sourceScraper: name, error: error.message });
    }
}

async function addReviewPosts(reviews, sourceKey, sourceLabel, postsInfo, scraperErrors) {
    for (const review of reviews) {
        try {
            const formattedDate = formatDate(review.reviewDate);
            const slug = reviewSlug(review, sourceKey);
            const imageResult = await downloadImage(review.coverImageUrl, slug, review.title);
            const expectedPostPath = path.join(CONTENT_DIR, `${slug}.md`);
            const postResult = imageResult.available
                ? createReviewPost(review, sourceKey, sourceLabel)
                : { created: false, filePath: expectedPostPath };

            postsInfo.push({
                title: review.title,
                timestamp: formattedDate,
                markdownFilePath: postResult.filePath,
                imageFilePath: imageResult.imagePath,
                imageDownloaded: imageResult.downloaded,
                imageAvailable: imageResult.available,
                postCreated: postResult.created,
                postSkippedReason: imageResult.available ? null : 'Cover image unavailable',
                reviewUrl: review.link,
                sourceScraper: `${sourceKey}-review-scraper`
            });
        } catch (error) {
            console.error(`Unable to process ${sourceLabel} review '${review.title}':`, error);
            scraperErrors.push({
                sourceScraper: `${sourceKey}-review-scraper`,
                title: review.title,
                error: error.message
            });
        }
    }
}

async function main() {
    if (!fs.existsSync(CONTENT_DIR)) fs.mkdirSync(CONTENT_DIR, { recursive: true });
    if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

    const postsInfo = [];
    const scraperErrors = [];
    const buildOutput = { stdout: '', stderr: '', exitCode: null };

    await runConfiguredScraper('youtube-channel-scraper', ['YOUTUBE_API_KEY', 'YOUTUBE_CHANNEL_ID'], async () => {
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
    }, scraperErrors);

    await runConfiguredScraper('flickr-album-scraper', ['FLICKR_API_KEY', 'FLICKR_USER_ID'], async () => {
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
    }, scraperErrors);

    await runConfiguredScraper('letterboxd-review-scraper', ['LETTERBOXD_USERNAME'], async () => {
        const reviews = await getLetterboxdReviews();
        await addReviewPosts(reviews, 'letterboxd', 'Letterboxd', postsInfo, scraperErrors);
    }, scraperErrors);

    await runConfiguredScraper('hardcover-review-scraper', ['HARDCOVER_API_TOKEN'], async () => {
        const reviews = await getHardcoverReviews();
        await addReviewPosts(reviews, 'hardcover', 'Hardcover', postsInfo, scraperErrors);
    }, scraperErrors);

    const contentFiles = listDirectoryFiles(CONTENT_DIR);
    const imageFiles = listDirectoryFiles(IMAGES_DIR);

    // Execute BUILD_COMMAND and capture output
    if (process.env.BUILD_COMMAND) {
        exec(process.env.BUILD_COMMAND, (error, stdout, stderr) => {
            buildOutput.stdout = stdout;
            buildOutput.stderr = stderr;
            buildOutput.exitCode = error ? error.code : 0;

            // Log the final output including build command results
            console.log(JSON.stringify({ postsInfo, scraperErrors, contentFiles, imageFiles, buildOutput }, null, 2));
        });
    } else {
        // Log the output if there is no build command
        console.log(JSON.stringify({ postsInfo, scraperErrors, contentFiles, imageFiles }, null, 2));
    }
}

module.exports = {
    addReviewPosts,
    createExcerpt,
    createReviewPost,
    downloadImage,
    formatDate,
    main,
    reviewSlug,
    sanitizeTitle
};

if (require.main === module) {
    main().catch(error => {
        console.error('Error in main:', error);
        process.exitCode = 1;
    });
}
