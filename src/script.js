import FFT from "fft.js";
const make = document.getElementById("make")
const output = document.getElementById("output")
const copy = document.getElementById("copy")
const quality = document.getElementById("quality");
const size = document.getElementById("size");

async function blobToAudioBuffer(blob) {
    const audioContext = new AudioContext();

    const arrayBuffer = await blob.arrayBuffer();

    const audioBuffer =
        await audioContext.decodeAudioData(arrayBuffer);

    return audioBuffer;
}

function analyzeMP3(audioBuffer) {
    const data = audioBuffer.getChannelData(0);

    const sampleRate = audioBuffer.sampleRate;

    const fftSize = 8192;
    const hopSize = 2048;

    const fft = new FFT(fftSize);
    const spectrum = fft.createComplexArray();

    const result = [];

    for (
        let start = 0;
        start + fftSize <= data.length;
        start += hopSize
    ) {
        const frame = new Float64Array(fftSize);

        let squareSum = 0;

        // 波形と音量を取得
        for (let i = 0; i < fftSize; i++) {
            const sample = data[start + i];

            squareSum += sample * sample;

            // Hann Window
            const window =
                0.5 - 0.5 * Math.cos(
                    2 * Math.PI * i / (fftSize - 1)
                );

            frame[i] = sample * window;
        }

        // RMS音量
        const rms = Math.sqrt(squareSum / fftSize);

        const db = 20 * Math.log10(Math.max(rms, 0.000001));

        const volume = Math.round(
            Math.max(0, Math.min(255, (db + 48) / 48 * 255))
        );

        // FFT
        fft.realTransform(spectrum, frame);


        let maxIndex = 0;
        let maxScore = 0;

        const minHz = 100;
        const maxHz = 3000;

        const minIndex = Math.ceil(minHz * fftSize / sampleRate);
        const endIndex = Math.min(
            fftSize / 2 - 2,
            Math.floor(maxHz * fftSize / sampleRate)
        );

        const magnitudes = new Float64Array(fftSize / 2);

        for (let i = 1; i < fftSize / 2; i++) {
            const re = spectrum[i * 2];
            const im = spectrum[i * 2 + 1];

            magnitudes[i] = Math.hypot(re, im);
        }

        // 基本周波数候補ごとに倍音を評価
        for (let i = minIndex; i <= endIndex; i++) {
            let score = 0;

            // 基本周波数とその倍音を評価
            for (let harmonic = 1; harmonic <= 5; harmonic++) {
                const index = Math.round(i * harmonic);

                if (index >= fftSize / 2) break;

                score += magnitudes[index] / harmonic;
            }

            if (score > maxScore) {
                maxScore = score;
                maxIndex = i;
            }
        }


        // 無音判定
        let hz = 0;

        if (db > -48 && maxIndex > 0) {
            // ピーク周辺を使って周波数を補間
            const getMagnitude = (i) => {
                const re = spectrum[i * 2];
                const im = spectrum[i * 2 + 1];

                return Math.max(Math.hypot(re, im), 0.000001);
            };

            const left = Math.log(getMagnitude(maxIndex - 1));
            const center = Math.log(getMagnitude(maxIndex));
            const right = Math.log(getMagnitude(maxIndex + 1));

            const denominator = left - 2 * center + right;

            const offset = denominator === 0
                ? 0
                : 0.5 * (left - right) / denominator;

            hz = (maxIndex + offset) * sampleRate / fftSize;
        }

        result.push({
            hz: Math.round(hz),
            time: hopSize / sampleRate * 1000,
            volume
        });
    }

    return result;
}


function mergeAudioData(data, quality = 2) {
    // quality: 1 = 高音質、2 = 標準、3 = 高圧縮、4 = 最大圧縮

    const settings = {
        1: { hz: 1, volume: 4, mergeHz: 0.01, mergeVolume: 6 },
        2: { hz: 5, volume: 8, mergeHz: 0.02, mergeVolume: 12 },
        3: { hz: 15, volume: 16, mergeHz: 0.05, mergeVolume: 24 },
        4: { hz: 30, volume: 32, mergeHz: 0.10, mergeVolume: 40 }
    };

    const config = settings[quality] || settings[2];

    const result = [];

    for (const item of data) {
        let hz = item.hz > 0
            ? Math.round(item.hz / config.hz) * config.hz
            : 0;

        let volume = Math.round(
            item.volume / config.volume
        ) * config.volume;

        volume = Math.min(255, volume);

        const current = {
            hz,
            volume,
            time: item.time
        };

        const last = result[result.length - 1];

        const similarHz = last && (
            // 両方無音なら結合
            (last.hz === 0 && current.hz === 0) ||

            // 両方音があるなら周波数を比較
            (
                last.hz > 0 &&
                current.hz > 0 &&
                Math.abs(last.hz - current.hz) <
                last.hz * config.mergeHz
            )
        );

        const similarVolume = last &&
            Math.abs(last.volume - current.volume) <
            config.mergeVolume;

        if (similarHz && similarVolume) {
            const oldTime = last.time;

            last.hz = Math.round(
                (last.hz * oldTime + current.hz * current.time) /
                (oldTime + current.time)
            );

            last.volume = Math.round(
                (last.volume * oldTime +
                    current.volume * current.time) /
                (oldTime + current.time)
            );

            last.time += current.time;
        } else {
            result.push(current);
        }
    }

    return result;
}


function generateMicrobit(data) {
    const commands = [];

    for (const item of data) {
        const hz = Math.round(item.hz);
        const time = Math.max(1, Math.round(item.time));
        const volume = Math.round(item.volume);

        if (hz <= 0) {
            commands.push(`    music.rest(${time})`);
        } else {
            commands.push(`    music.setVolume(${volume})`);
            commands.push(`    music.playTone(${hz}, ${time})`);
        }
    }

    return `
input.onButtonPressed(Button.A, function () {
${commands.join("\n")}
})
`;
}

make.onclick = () => {
    const input = document.createElement("input")
    make.textContent = "作成中..."
    input.onchange = async () => {
        try {
            const audiobuffer = await blobToAudioBuffer(input.files[0]);
            const data = analyzeMP3(audiobuffer);

            const datacompressed = mergeAudioData(
                data,
                Number(quality.value)
            );

            const code = generateMicrobit(datacompressed);

            output.textContent = code;

            size.textContent =
                `コードサイズ: ${new Blob([code]).size.toLocaleString()} bytes`;

            if (new Blob([code]).size > 100000) {
                alert("このサイズだとmakecodeに入らない可能性があります")
            }

            make.textContent = "作成"
        } catch (e) {
            if (e instanceof Error) {
                alert(`エラーが発生しました。エラー名：${e.name}、エラーメッセージ：${e.message}`)
            }
        }
    }
    input.type = "file"
    input.accept = "audio/*"
    input.click()
}

copy.onclick = async () => {
    copy.textContent = "コピー中...";
    try {
        await navigator.clipboard.writeText(output.textContent);

        copy.textContent = "コピーしました！";
    } catch (error) {
        console.error("コピー失敗:", error);
        copy.textContent = "コピーに失敗しました";
    }
}