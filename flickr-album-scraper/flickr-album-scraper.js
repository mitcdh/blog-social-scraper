const https = require('https');
try {
  require('dotenv').config();
} catch (error) {
  console.warn("dotenv is not available. Continuing without loading environment variables from .env file.");
}

const FLICKR_API_KEY = process.env.FLICKR_API_KEY;
const USER_ID = process.env.FLICKR_USER_ID;
const DATE_REGEX = new RegExp(process.env.DATE_REGEX || '^\d{4}-\d{2}\s*');

const httpsGet = (url) => {
    return new Promise((resolve, reject) => {
        https.get(url, res => {
            let data = '';

            res.on('data', chunk => {
                data += chunk;
            });

            res.on('end', () => {
                resolve(JSON.parse(data));
            });
        }).on('error', error => {
            reject(error);
        });
    });
};

const getAlbums = async () => {
    try {
        const response = await httpsGet(`https://www.flickr.com/services/rest/?method=flickr.photosets.getList&api_key=${FLICKR_API_KEY}&user_id=${USER_ID}&format=json&nojsoncallback=1`);
        const albums = response.photosets.photoset;

        return Promise.all(albums.map(async album => {
            const albumDetailsResponse = await httpsGet(`https://www.flickr.com/services/rest/?method=flickr.photosets.getInfo&api_key=${FLICKR_API_KEY}&photoset_id=${album.id}&format=json&nojsoncallback=1`);
            const albumDetails = albumDetailsResponse.photoset;
            const updatedTitle = albumDetails.title._content.replace(DATE_REGEX, '');

            const primaryPhotoResponse = await httpsGet(`https://www.flickr.com/services/rest/?method=flickr.photos.getInfo&api_key=${FLICKR_API_KEY}&photo_id=${album.primary}&format=json&nojsoncallback=1`);
            const primaryPhoto = primaryPhotoResponse.photo;
            const primaryPhotoUrl = `https://farm${primaryPhoto.farm}.staticflickr.com/${primaryPhoto.server}/${primaryPhoto.id}_${primaryPhoto.secret}_b.jpg`;

            const lastPhotoResponse = await httpsGet(`https://www.flickr.com/services/rest/?method=flickr.photosets.getPhotos&api_key=${FLICKR_API_KEY}&photoset_id=${album.id}&user_id=${USER_ID}&format=json&nojsoncallback=1&extras=date_taken`);
            const photos = lastPhotoResponse.photoset.photo.sort((a, b) =>
                new Date(b.datetaken) - new Date(a.datetaken)
            );
            const lastPhoto = photos[0];

            return {
                title: updatedTitle,
                description: albumDetails.description._content,
                lastPhotoTimestamp: lastPhoto.datetaken || new Date(lastPhotoResponse.photoset.date_update).toISOString(),
                link: `https://www.flickr.com/photos/${USER_ID}/sets/${album.id}`,
                featureImageUrl: primaryPhotoUrl
            };
        }));
    } catch (error) {
        console.error('Error fetching data from Flickr API:', error);
    }
};

// Export the function for use in other files
module.exports = getAlbums;

// Check if the script is being run directly
if (require.main === module) {
    getAlbums().then(albumsData => {
        console.log('Album Data:', albumsData);
    }).catch(error => {
        console.error('Error:', error);
    });
}
