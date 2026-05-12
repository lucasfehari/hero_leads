const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const path = require('path');
const fs = require('fs');

ffmpeg.setFfmpegPath(ffmpegPath);

function convertToOggOpus(inputPath) {
    return new Promise((resolve, reject) => {
        if (!inputPath || !fs.existsSync(inputPath)) {
            return reject(new Error('Input file does not exist.'));
        }

        // If it's already an ogg file, just return it
        if (inputPath.toLowerCase().endsWith('.ogg')) {
            return resolve(inputPath);
        }

        const parsed = path.parse(inputPath);
        const outputPath = path.join(parsed.dir, `${parsed.name}.ogg`);

        // If we already converted this before, return the cached .ogg file
        if (fs.existsSync(outputPath)) {
            return resolve(outputPath);
        }

        ffmpeg(inputPath)
            .audioCodec('libopus')
            .audioChannels(1)
            .audioFrequency(48000)
            .toFormat('ogg')
            .on('error', (err) => reject(new Error('FFmpeg error: ' + err.message)))
            .on('end', () => resolve(outputPath))
            .save(outputPath);
    });
}

module.exports = {
    convertToOggOpus
};
