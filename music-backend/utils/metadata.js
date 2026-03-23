const mm = require("music-metadata");

async function getMetadata(filePath) {

    const metadata = await mm.parseFile(filePath);

    return {
        title: metadata.common.title,
        artist: metadata.common.artist,
        album: metadata.common.album,
        duration: metadata.format.duration
    };

}

module.exports = getMetadata;