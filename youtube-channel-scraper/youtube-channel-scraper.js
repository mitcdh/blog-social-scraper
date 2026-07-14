const https = require('https');
try {
  require('dotenv').config();
} catch (error) {
  console.warn("dotenv is not available. Continuing without loading environment variables from .env file.");
}

const apiKey = process.env.YOUTUBE_API_KEY;
const channelId = process.env.YOUTUBE_CHANNEL_ID;

async function getVideoDetails(videoId) {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`;

  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';

      res.on('data', chunk => {
        data += chunk;
      });

      res.on('end', () => {
        const response = JSON.parse(data);
        if (response.items.length === 0) {
          resolve('No video found for the given ID.');
          return;
        }

        const video = response.items[0].snippet;
        const thumbnails = video.thumbnails;
        const thumbnailUrl =
          (thumbnails.maxres && thumbnails.maxres.url) ||
          (thumbnails.standard && thumbnails.standard.url) ||
          (thumbnails.high && thumbnails.high.url) ||
          (thumbnails.medium && thumbnails.medium.url) ||
          thumbnails.default.url;

        resolve({
          title: video.title,
          embedLink: `https://www.youtube.com/embed/${videoId}`,
          thumbnailUrl: thumbnailUrl,
          publishedAt: video.publishedAt,
          description: video.description
        });
      });
    }).on('error', error => {
      console.error('Error fetching video details:', error);
      reject(error);
    });
  });
}

async function listAllVideos() {
  let allVideos = [];
  let nextPageToken = '';
  do {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&maxResults=50&pageToken=${nextPageToken}&type=video&key=${apiKey}`;

    const response = await new Promise((resolve, reject) => {
      https.get(url, res => {
        let data = '';

        res.on('data', chunk => {
          data += chunk;
        });

        res.on('end', () => {
          resolve(JSON.parse(data));
        });
      }).on('error', error => {
        console.error('Error fetching video list:', error);
        reject(error);
      });
    });

    const videoIds = response.items.map(item => item.id.videoId);
    nextPageToken = response.nextPageToken;

    for (let videoId of videoIds) {
      const videoDetails = await getVideoDetails(videoId);
      allVideos.push(videoDetails);
    }
  } while (nextPageToken);

  return allVideos;
}

if (require.main === module) {
  listAllVideos()
    .then(videos => console.log(videos))
    .catch(error => console.error(error));
} else {
  module.exports = listAllVideos;
}
