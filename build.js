
const puppeteer = require("puppeteer");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { PuppeteerScreenRecorder } = require("puppeteer-screen-recorder");

// ============================================================
// BRAINBYT QUIZ BUILDER — 20 SECOND VERTICAL VIDEO
// Resolution: 1080 x 1920 | FPS: 30 | Duration: 20 seconds
// ============================================================

console.log("\n====================================");
console.log("🧠 BRAINBYT 20 SECOND BUILDER");
console.log("====================================");

function loadEnvFile() {
    const envPath = path.join(__dirname, ".env");
    if (!fs.existsSync(envPath)) return;

    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith("#")) continue;

        const index = trimmed.indexOf("=");
        if (index === -1) continue;

        const key = trimmed.slice(0, index).trim();
        const value = trimmed.slice(index + 1).trim()
            .replace(/^['"]|['"]$/g, "");

        if (!process.env[key]) process.env[key] = value;
    }
}

loadEnvFile();

// ============================================================
// CONFIGURATION
// ============================================================

const API_KEY = process.env.ELEVENLABS_API_KEY;

const VOICE_ID =
    process.env.ELEVENLABS_VOICE_ID ||
    "pNInz6obpgDQGcFmaJgB";

const ELEVENLABS_MODEL = "eleven_multilingual_v2";

const VIDEO_WIDTH = 1080;
const VIDEO_HEIGHT = 1920;
const FPS = 30;

const TOTAL_DURATION = 20000;
const MAX_QUESTION_DURATION = 6000;
const QUESTION_PAUSE_DURATION = 3000;
const TIMER_DURATION = 3000;
const WRONG_DURATION = 3000;
const CTA_DURATION = 5000;

if (!API_KEY) {
    console.error("❌ ELEVENLABS_API_KEY missing.");
    console.error("Add ELEVENLABS_API_KEY to GitHub Secrets or .env.");
    process.exit(1);
}

// ============================================================
// LANGUAGE HELPERS
// ============================================================

function containsHindi(text) {
    return /[\u0900-\u097F]/.test(String(text || ""));
}

function hindiCount(text) {
    return (String(text || "").match(/[\u0900-\u097F]/g) || []).length;
}

function englishCount(text) {
    return (String(text || "").match(/[A-Za-z]/g) || []).length;
}

function mostlyHindi(text) {
    return hindiCount(text) >= englishCount(text);
}

// ============================================================
// TEXT NORMALIZER
// ============================================================

function prepareSpeechText(text) {
    if (!text) return "";

    let result = String(text);
    const hindi = mostlyHindi(result);

    result = result.replace(/<[^>]*>/g, " ");

    result = result.replace(
        /₹\s*/g,
        hindi ? " रुपये " : " rupees "
    );

    result = result.replace(
        /%/g,
        hindi ? " प्रतिशत " : " percent "
    );

    if (hindi) {
        result = result
            .replace(/×/g, " गुणा ")
            .replace(/÷/g, " भाग ")
            .replace(/=/g, " बराबर ")
            .replace(/\+/g, " प्लस ")
            .replace(/[−-]/g, " माइनस ");
    } else {
        result = result
            .replace(/×/g, " times ")
            .replace(/÷/g, " divided by ")
            .replace(/=/g, " equals ")
            .replace(/\+/g, " plus ")
            .replace(/[−-]/g, " minus ");
    }

    result = result.replace(
        /(\d+)\s*\/\s*(\d+)/g,
        hindi ? "$1 बटा $2" : "$1 over $2"
    );

    result = result.replace(
        /(\d)\.(\d)/g,
        hindi ? "$1 दशमलव $2" : "$1 point $2"
    );

    const acronyms = {
        CPU: "C P U",
        GPU: "G P U",
        AI: "A I",
        API: "A P I",
        GDP: "G D P",
        DNA: "D N A",
        RNA: "R N A",
        USB: "U S B",
        HTML: "H T M L",
        CSS: "C S S",
        URL: "U R L",
        HTTP: "H T T P",
        HTTPS: "H T T P S",
        RAM: "R A M",
        ROM: "R O M",
        IQ: "I Q",
        ISRO: "I S R O",
        NASA: "N A S A",
        UPSC: "U P S C",
        SSC: "S S C",
        CGL: "C G L"
    };

    for (const [word, spoken] of Object.entries(acronyms)) {
        result = result.replace(
            new RegExp(`\\b${word}\\b`, "g"),
            spoken
        );
    }

    return result
        .replace(/&/g, " and ")
        .replace(/@/g, " at ")
        .replace(/#/g, " number ")
        .replace(/\|/g, " ")
        .replace(/:/g, ", ")
        .replace(/;/g, ", ")
        .replace(/\s+/g, " ")
        .trim();
}

// ============================================================
// SPEECH TEXT
// ============================================================

function createTimerSpeech(question) {
    return containsHindi(question)
        ? "सिर्फ तीन सेकंड।"
        : "Only three seconds.";
}

function createWrongSpeech(question, letter1, letter2) {
    if (containsHindi(question)) {
        const map = {
            A: "ए",
            B: "बी",
            C: "सी",
            D: "डी"
        };

        return `विकल्प ${map[letter1]} और ${map[letter2]} गलत हैं।`;
    }

    return `Options ${letter1} and ${letter2} are wrong.`;
}

function createCombinedCTA(question) {
    return containsHindi(question)
        ? "सही answer comment करो, मैं सही answer pin करूँगा।"
        : "Comment the correct answer, and I will pin it.";
}

// ============================================================
// ELEVENLABS TTS
// ============================================================

async function generateAudio(text, filename) {
    const speechText = prepareSpeechText(text);

    console.log(`\n🎙️ ElevenLabs: ${speechText}`);

    const url =
        `https://api.elevenlabs.io/v1/text-to-speech/` +
        `${VOICE_ID}?output_format=mp3_44100_128`;

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "xi-api-key": API_KEY,
            "Content-Type": "application/json",
            Accept: "audio/mpeg"
        },
        body: JSON.stringify({
            text: speechText,
            model_id: ELEVENLABS_MODEL,
            voice_settings: {
                speed: 1.15,
                stability: 0.45,
                similarity_boost: 0.78,
                style: 0.1,
                use_speaker_boost: true
            }
        })
    });

    if (!response.ok) {
        throw new Error(
            `ElevenLabs ${response.status}: ${await response.text()}`
        );
    }

    fs.writeFileSync(
        filename,
        Buffer.from(await response.arrayBuffer())
    );

    console.log(`✅ ${filename}`);
}

// ============================================================
// AUDIO DURATION
// ============================================================

function getAudioDuration(filename) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filename, (err, metadata) => {
            if (err) return reject(err);

            const duration = Number(metadata?.format?.duration);

            if (!Number.isFinite(duration)) {
                return reject(
                    new Error(`Unable to read duration: ${filename}`)
                );
            }

            resolve(duration);
        });
    });
}

// ============================================================
// AUDIO SPEED FILTER
// ============================================================

function createAtempoFilter(factor) {
    let value = Number(factor);

    if (!Number.isFinite(value) || value <= 0) return "";

    const filters = [];

    while (value > 2) {
        filters.push("atempo=2");
        value /= 2;
    }

    while (value < 0.5) {
        filters.push("atempo=0.5");
        value /= 0.5;
    }

    filters.push(`atempo=${value}`);

    return filters.join(",");
}

// ============================================================
// FIT QUESTION VOICE
// ============================================================

async function fitQuestionAudio() {
    const input = "audio_question_raw.mp3";
    const output = "audio_question.mp3";

    const originalDuration = await getAudioDuration(input);

    console.log(
        `\n🎙️ Question voice duration: ${originalDuration.toFixed(2)} sec`
    );

    if (originalDuration <= MAX_QUESTION_DURATION / 1000) {
        fs.copyFileSync(input, output);
        return await getAudioDuration(output);
    }

    const target = MAX_QUESTION_DURATION / 1000;

    const atempo = createAtempoFilter(
        originalDuration / target
    );

    console.log(`⚡ Question voice speed adjusted to fit ${target} seconds.`);

    await new Promise((resolve, reject) => {
        let cmd = ffmpeg(input);

        if (atempo) {
            cmd = cmd.audioFilters(atempo);
        }

        cmd
            .audioCodec("libmp3lame")
            .audioBitrate("128k")
            .audioFrequency(44100)
            .outputOptions(["-t", String(target)])
            .save(output)
            .on("end", resolve)
            .on("error", reject);
    });

    return Math.min(
        await getAudioDuration(output),
        target
    );
}

// ============================================================
// FIT CTA VOICE
// ============================================================

async function fitCTAIfNeeded(availableSeconds) {
    const input = "audio_cta_raw.mp3";
    const output = "audio_cta.mp3";

    const duration = await getAudioDuration(input);

    console.log(
        `\n🎙️ CTA voice duration: ${duration.toFixed(2)} sec`
    );

    if (duration <= availableSeconds) {
        fs.copyFileSync(input, output);
        return duration;
    }

    const factor = duration / availableSeconds;
    const atempo = createAtempoFilter(factor);

    console.log(`⚡ CTA speech speed adjusted by ${factor.toFixed(2)}x.`);

    await new Promise((resolve, reject) => {
        let cmd = ffmpeg(input);

        if (atempo) {
            cmd = cmd.audioFilters(atempo);
        }

        cmd
            .audioCodec("libmp3lame")
            .audioBitrate("128k")
            .audioFrequency(44100)
            .outputOptions(["-t", String(availableSeconds)])
            .save(output)
            .on("end", resolve)
            .on("error", reject);
    });

    return availableSeconds;
}

// ============================================================
// FIXED BEEP GENERATOR
// Creates beep.wav directly in Node.js.
// No FFmpeg lavfi input is required.
// ============================================================

function generateBeep() {
    return new Promise((resolve, reject) => {
        try {
            const sampleRate = 44100;
            const channels = 2;
            const duration = 0.12;
            const frequency = 850;
            const bitsPerSample = 16;

            const numSamples = Math.floor(sampleRate * duration);
            const bytesPerSample = bitsPerSample / 8;
            const dataSize =
                numSamples * channels * bytesPerSample;

            const buffer = Buffer.alloc(44 + dataSize);

            // WAV header
            buffer.write("RIFF", 0);
            buffer.writeUInt32LE(36 + dataSize, 4);
            buffer.write("WAVE", 8);
            buffer.write("fmt ", 12);
            buffer.writeUInt32LE(16, 16);
            buffer.writeUInt16LE(1, 20);
            buffer.writeUInt16LE(channels, 22);
            buffer.writeUInt32LE(sampleRate, 24);
            buffer.writeUInt32LE(
                sampleRate * channels * bytesPerSample,
                28
            );
            buffer.writeUInt16LE(
                channels * bytesPerSample,
                32
            );
            buffer.writeUInt16LE(bitsPerSample, 34);
            buffer.write("data", 36);
            buffer.writeUInt32LE(dataSize, 40);

            // Generate an 850 Hz beep with a short fade
            for (let i = 0; i < numSamples; i++) {
                const t = i / sampleRate;

                const fadeIn = Math.min(1, t / 0.005);
                const fadeOut = Math.min(
                    1,
                    (duration - t) / 0.01
                );

                const envelope = Math.max(
                    0,
                    Math.min(fadeIn, fadeOut)
                );

                const sample = Math.round(
                    0.25 *
                    envelope *
                    Math.sin(2 * Math.PI * frequency * t) *
                    32767
                );

                const offset =
                    44 + i * channels * bytesPerSample;

                buffer.writeInt16LE(sample, offset);
                buffer.writeInt16LE(sample, offset + 2);
            }

            fs.writeFileSync("beep.wav", buffer);

            console.log("✅ beep.wav generated without lavfi");

            resolve();
        } catch (error) {
            reject(error);
        }
    });
}

// ============================================================
// MUSIC
// ============================================================

function findMusic() {
    const dir = path.join(__dirname, "music");

    if (!fs.existsSync(dir)) return null;

    const files = fs.readdirSync(dir).filter(
        f => /\.(mp3|wav|m4a)$/i.test(f)
    );

    if (!files.length) return null;

    const preferred = files.find(
        f => f.toLowerCase() === "music1.mp3"
    );

    return path.join(dir, preferred || files[0]);
}

// ============================================================
// QUESTION IMAGE
// ============================================================

function getQuestionImage(question) {
    if (!question.image) return null;

    const imagePath = path.resolve(
        __dirname,
        question.image
    );

    return fs.existsSync(imagePath) ? imagePath : null;
}

// ============================================================
// CORRECT ANSWER INDEX
// ============================================================

function getCorrectIndex(question) {
    const options = Array.isArray(question.o)
        ? question.o
        : [];

    if (
        typeof question.a === "number" &&
        question.a >= 0 &&
        question.a < options.length
    ) {
        return question.a;
    }

    const answer = String(question.a ?? "").trim();

    const letters = ["A", "B", "C", "D"];

    const letterIndex = letters.indexOf(
        answer.toUpperCase()
    );

    if (letterIndex >= 0 && letterIndex < options.length) {
        return letterIndex;
    }

    const textIndex = options.findIndex(
        option =>
            String(option).trim().toLowerCase() ===
            answer.toLowerCase()
    );

    return textIndex >= 0 ? textIndex : 0;
}

// ============================================================
// CLEANUP
// ============================================================

function removeIfExists(filename) {
    try {
        if (fs.existsSync(filename)) {
            fs.unlinkSync(filename);
        }
    } catch {
        // Ignore cleanup errors
    }
}

// ============================================================
// MAIN
// ============================================================

(async () => {
    let browser = null;

    try {
        const tempFiles = [
            "video_no_audio.mp4",
            "Brainbyt_Final_Video.mp4",
            "audio_question_raw.mp3",
            "audio_question.mp3",
            "audio_timer.mp3",
            "audio_wrong.mp3",
            "audio_cta_raw.mp3",
            "audio_cta.mp3",
            "beep.wav"
        ];

        tempFiles.forEach(removeIfExists);

        // TRACKER
        const trackerFile = path.join(__dirname, "tracker.json");

        let currentIndex = 0;

        if (fs.existsSync(trackerFile)) {
            try {
                currentIndex =
                    Number(
                        JSON.parse(
                            fs.readFileSync(trackerFile, "utf8")
                        ).currentIndex
                    ) || 0;
            } catch {
                currentIndex = 0;
            }
        }

        // PLAY.JSON
        const playFile = path.join(__dirname, "play.json");

        if (!fs.existsSync(playFile)) {
            throw new Error("play.json not found");
        }

        const playData = JSON.parse(
            fs.readFileSync(playFile, "utf8")
        );

        if (!Array.isArray(playData?.sets?.[0]?.questions)) {
            throw new Error(
                "play.json format invalid: expected sets[0].questions array"
            );
        }

        const questions = playData.sets[0].questions;

        if (!questions.length) {
            throw new Error("No questions found in play.json");
        }

        currentIndex %= questions.length;

        const question = questions[currentIndex];

        if (!question.q) {
            throw new Error("Question text missing");
        }

        if (!Array.isArray(question.o) || question.o.length < 4) {
            throw new Error("Question must have at least 4 options");
        }

        console.log(
            `\n📝 Question #${currentIndex + 1}: ${question.q}`
        );

        const correctIndex = getCorrectIndex(question);

        const letters = ["A", "B", "C", "D"];

        const wrongIndexes = letters
            .map((_, i) => i)
            .filter(i => i !== correctIndex);

        const pairStart = currentIndex % wrongIndexes.length;

        const wrongIndex1 = wrongIndexes[pairStart];

        const wrongIndex2 =
            wrongIndexes[
                (pairStart + 1) % wrongIndexes.length
            ];

        const wrongLetter1 = letters[wrongIndex1];
        const wrongLetter2 = letters[wrongIndex2];

        console.log(
            `❌ Wrong option 1: ${wrongLetter1} ${question.o[wrongIndex1]}`
        );

        console.log(
            `❌ Wrong option 2: ${wrongLetter2} ${question.o[wrongIndex2]}`
        );

        const imagePath = getQuestionImage(question);
        const musicPath = findMusic();

        // Advance tracker for next run
        fs.writeFileSync(
            trackerFile,
            JSON.stringify(
                {
                    currentIndex:
                        (currentIndex + 1) % questions.length
                },
                null,
                2
            )
        );

        // UPLOAD METADATA
        const cleanTitle = String(question.q)
            .replace(/[:?=]/g, "")
            .replace(/\s+/g, " ")
            .slice(0, 55)
            .trim();

        const metadata = {
            youtube: {
                title: `${cleanTitle} 🧠 #shorts #quiz`,
                description:
                    `Can you solve this? 🧠\n\n` +
                    `You only have 3 seconds!\n\n` +
                    `Comment your answer 👇\n\n` +
                    `#brainbyt #quiz #shorts #gk #trivia`
            },

            instagram: {
                caption:
                    `Can you solve this? 🧠\n\n` +
                    `You have only 3 seconds!\n\n` +
                    `Comment the correct answer 👇\n\n` +
                    `#brainbyt #quiz #reels #gk #trivia #quiztime`
            },

            facebook: {
                caption:
                    `क्या आप इसका सही answer दे सकते हैं? 🧠\n\n` +
                    `आपके पास सिर्फ 3 सेकंड हैं!\n\n` +
                    `सही answer comment में बताइए 👇`
            }
        };

        fs.writeFileSync(
            path.join(__dirname, "current_upload_metadata.json"),
            JSON.stringify(metadata, null, 2)
        );

        // GENERATE ALL AUDIO
        await generateAudio(
            question.q,
            "audio_question_raw.mp3"
        );

        const actualQuestionSeconds =
            await fitQuestionAudio();

        await generateAudio(
            createTimerSpeech(question.q),
            "audio_timer.mp3"
        );

        await generateAudio(
            createWrongSpeech(
                question.q,
                wrongLetter1,
                wrongLetter2
            ),
            "audio_wrong.mp3"
        );

        await generateAudio(
            createCombinedCTA(question.q),
            "audio_cta_raw.mp3"
        );

        await fitCTAIfNeeded(CTA_DURATION / 1000);

        // FIXED: No FFmpeg lavfi call
        await generateBeep();

        // TIMELINE
        const timerStart =
            Math.ceil(actualQuestionSeconds * 1000) +
            QUESTION_PAUSE_DURATION;

        const wrongStart =
            timerStart + TIMER_DURATION;

        const ctaStart =
            wrongStart + WRONG_DURATION;

        const ctaEnd =
            ctaStart + CTA_DURATION;

        const finalHoldMs =
            TOTAL_DURATION - ctaEnd;

        if (finalHoldMs < 0) {
            throw new Error(
                "Question audio/timeline too long for a 20-second video."
            );
        }

        console.log("\n====================================");
        console.log(
            `Question voice: 0–${actualQuestionSeconds.toFixed(2)} sec`
        );
        console.log(
            `Question/options visible until: ${(timerStart / 1000).toFixed(2)} sec`
        );
        console.log(
            `Countdown: ${(timerStart / 1000).toFixed(2)}–${(wrongStart / 1000).toFixed(2)} sec`
        );
        console.log(
            `Wrong options: ${(wrongStart / 1000).toFixed(2)}–${(ctaStart / 1000).toFixed(2)} sec`
        );
        console.log(
            `CTA: ${(ctaStart / 1000).toFixed(2)}–${(ctaEnd / 1000).toFixed(2)} sec`
        );
        console.log(
            `End hold: ${(finalHoldMs / 1000).toFixed(2)} sec`
        );
        console.log("Target duration: 20.00 sec");
        console.log("====================================");

        // PUPPETEER
        console.log("\n🌐 Starting Chromium...");

        browser = await puppeteer.launch({
            headless: true,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--disable-web-security",
                "--allow-file-access-from-files",
                "--font-render-hinting=none"
            ]
        });

        const page = await browser.newPage();

        await page.setViewport({
            width: VIDEO_WIDTH,
            height: VIDEO_HEIGHT,
            deviceScaleFactor: 1
        });

        const htmlPath = path.join(__dirname, "index.html");

        if (!fs.existsSync(htmlPath)) {
            throw new Error("index.html not found");
        }

        await page.goto(
            pathToFileURL(htmlPath).href,
            { waitUntil: "networkidle0" }
        );

        // INJECT QUESTION DATA AND TIMELINE
        await page.evaluate(
            (
                q,
                imageUrl,
                w1,
                w2,
                timerStartMs,
                wrongStartMs,
                ctaStartMs,
                totalDurationMs
            ) => {
                const letters = ["A", "B", "C", "D"];

                const setText = (id, value) => {
                    const el = document.getElementById(id);
                    if (el) el.textContent = value ?? "";
                };

                setText(
                    "category",
                    q.categoryLabel || q.category || "BRAINBYT QUIZ"
                );

                setText("question-text", q.q || "");

                for (let i = 0; i < 4; i++) {
                    setText(
                        `option${i}`,
                        q.o[i] != null ? String(q.o[i]) : ""
                    );
                }

                setText("timer-question-text", q.q || "");

                setText("wrong1-text", q.o[w1]);
                setText("wrong1-letter", letters[w1]);
                setText("wrong1-letter-small", letters[w1]);

                setText("wrong2-text", q.o[w2]);
                setText("wrong2-letter", letters[w2]);
                setText("wrong2-letter-small", letters[w2]);

                const isHindi =
                    /[\u0900-\u097F]/.test(String(q.q || ""));

                setText(
                    "explanation-text",
                    isHindi
                        ? "सही Answer Comment करो 👇"
                        : "Comment the Correct Answer 👇"
                );

                setText(
                    "step1",
                    isHindi
                        ? "मैं सही Answer Pin करूँगा 📌"
                        : "I will Pin the Correct Answer 📌"
                );

                setText(
                    "step2",
                    isHindi
                        ? "A, B, C या D में अपना Answer बताओ"
                        : "Tell me your Answer: A, B, C or D"
                );

                const bg = document.getElementById("bg-image");

                if (bg && imageUrl) {
                    bg.style.backgroundImage =
                        `url("${imageUrl}")`;
                    bg.style.opacity = "0.25";
                } else if (bg) {
                    bg.style.backgroundImage = "none";
                    bg.style.opacity = "0";
                }

                document.querySelectorAll(".scene").forEach(
                    scene => scene.classList.remove("active")
                );

                window.startVideo = function () {
                    const show = id => {
                        document.querySelectorAll(".scene").forEach(
                            scene => scene.classList.remove("active")
                        );

                        const scene = document.getElementById(id);
                        if (scene) scene.classList.add("active");
                    };

                    show("question");

                    const countdown =
                        document.getElementById("countdown");

                    const circle =
                        document.getElementById("timer-circle");

                    const progress =
                        document.getElementById("progress");

                    const start = performance.now();

                    function updateProgress() {
                        const elapsed = performance.now() - start;

                        if (progress) {
                            progress.style.width =
                                `${Math.min(
                                    100,
                                    elapsed / totalDurationMs * 100
                                )}%`;
                        }

                        if (elapsed < totalDurationMs) {
                            requestAnimationFrame(updateProgress);
                        }
                    }

                    requestAnimationFrame(updateProgress);

                    setTimeout(() => {
                        show("timer");

                        if (countdown) {
                            countdown.textContent = "3";
                            countdown.style.color = "#ffffff";
                        }

                        if (circle) {
                            circle.style.transition = "none";
                            circle.style.strokeDashoffset = "785";

                            void circle.offsetWidth;

                            circle.style.transition =
                                "stroke-dashoffset 3s linear";

                            circle.style.strokeDashoffset = "0";
                        }

                        let n = 3;

                        const interval = setInterval(() => {
                            n--;

                            if (countdown) {
                                countdown.textContent =
                                    String(Math.max(0, n));

                                if (n <= 1 && n > 0) {
                                    countdown.style.color = "#ff3155";
                                }
                            }

                            if (n <= 0) clearInterval(interval);
                        }, 1000);
                    }, timerStartMs);

                    setTimeout(() => {
                        show("answer");
                    }, wrongStartMs);

                    setTimeout(() => {
                        show("explanation");
                    }, ctaStartMs);

                    setTimeout(() => {
                        if (ctaStartMs + 5000 < totalDurationMs) {
                            show("question");
                        }
                    }, ctaStartMs + 5000);
                };

                window.videoReady = true;
            },

            question,

            imagePath
                ? pathToFileURL(imagePath).href
                : null,

            wrongIndex1,
            wrongIndex2,
            timerStart,
            wrongStart,
            ctaStart,
            TOTAL_DURATION
        );

        await page.waitForFunction(
            () => window.videoReady === true
        );

        console.log("✅ Browser ready");

        // RECORD VIDEO
        const recorder = new PuppeteerScreenRecorder(page, {
            fps: FPS,
            videoFrame: {
                width: VIDEO_WIDTH,
                height: VIDEO_HEIGHT
            },
            videoBitrate: 12000,
            aspectRatio: "9:16"
        });

        console.log("🎥 Recording 20-second video...");

        await recorder.start("video_no_audio.mp4");

        await new Promise(resolve => setTimeout(resolve, 150));

        await page.evaluate(() => {
            if (typeof window.startVideo !== "function") {
                throw new Error(
                    "startVideo() not found in injected page"
                );
            }

            window.startVideo();
        });

        await new Promise(resolve =>
            setTimeout(resolve, TOTAL_DURATION + 200)
        );

        await recorder.stop();

        await browser.close();
        browser = null;

        console.log("✅ Video recording complete");

        // ====================================================
        // AUDIO MIXING
        // ====================================================

        console.log("\n🎧 Mixing audio...");

        const inputs = [
            "video_no_audio.mp4",
            "audio_question.mp3",
            "audio_timer.mp3",
            "audio_wrong.mp3",
            "audio_cta.mp3",
            "beep.wav"
        ];

        if (musicPath) {
            inputs.push(musicPath);
        }

        let command = ffmpeg();

        inputs.forEach(input => {
            command = command.input(input);
        });

        const filters = [];

        // Question voice starts at 0 seconds
        filters.push(
            "[1:a]volume=1.0,asetpts=PTS-STARTPTS[qvoice]"
        );

        // Timer voice
        filters.push(
            `[2:a]volume=1.0,` +
            `atrim=duration=2.85,` +
            `asetpts=PTS-STARTPTS,` +
            `adelay=${timerStart}|${timerStart}[tvoice]`
        );

        // Wrong-option voice
        filters.push(
            `[3:a]volume=1.0,` +
            `atrim=duration=2.85,` +
            `asetpts=PTS-STARTPTS,` +
            `adelay=${wrongStart}|${wrongStart}[wvoice]`
        );

        // CTA voice
        filters.push(
            `[4:a]volume=1.0,` +
            `asetpts=PTS-STARTPTS,` +
            `atrim=duration=5,` +
            `adelay=${ctaStart}|${ctaStart}[ctavoice]`
        );

        // Countdown beeps
        const beepTimes = [
            timerStart + 200,
            timerStart + 1200,
            timerStart + 2200
        ];

        beepTimes.forEach((time, i) => {
            filters.push(
                `[5:a]volume=0.22,` +
                `adelay=${Math.round(time)}|${Math.round(time)}[b${i}]`
            );
        });

        // Optional background music
        if (musicPath) {
            filters.push(
                "[6:a]volume=0.055," +
                "aloop=loop=-1:size=2147483647," +
                "atrim=duration=20," +
                "asetpts=PTS-STARTPTS[music]"
            );
        }

        const mix = [
            "[qvoice]",
            "[tvoice]",
            "[wvoice]",
            "[ctavoice]",
            "[b0]",
            "[b1]",
            "[b2]"
        ];

        if (musicPath) {
            mix.push("[music]");
        }

        filters.push(
            `${mix.join("")}` +
            `amix=inputs=${mix.length}:duration=longest:dropout_transition=0,` +
            `aresample=44100,` +
            `atrim=duration=20,` +
            `asetpts=PTS-STARTPTS,` +
            `loudnorm=I=-16:TP=-1.5:LRA=11[aout]`
        );

        // FINAL VIDEO
        const outputFile = "Brainbyt_Final_Video.mp4";

        await new Promise((resolve, reject) => {
            command
                .complexFilter(filters)
                .outputOptions([
                    "-map 0:v",
                    "-map [aout]",
                    "-c:v libx264",
                    "-preset veryfast",
                    "-crf 18",
                    "-pix_fmt yuv420p",
                    "-r 30",
                    "-c:a aac",
                    "-b:a 192k",
                    "-ar 44100",
                    "-t 20",
                    "-movflags +faststart"
                ])
                .save(outputFile)
                .on("start", () => {
                    console.log("🎬 FFmpeg started");
                })
                .on("progress", p => {
                    if (typeof p.percent === "number") {
                        console.log(
                            `Rendering: ${p.percent.toFixed(1)}%`
                        );
                    }
                })
                .on("end", resolve)
                .on("error", reject);
        });

        // VERIFY FINAL DURATION
        const finalDuration = await new Promise(
            (resolve, reject) => {
                ffmpeg.ffprobe(outputFile, (err, metadata) => {
                    if (err) return reject(err);

                    resolve(
                        Number(metadata?.format?.duration)
                    );
                });
            }
        );

        console.log("\n====================================");
        console.log("✅ VIDEO READY");
        console.log(
            `⏱️ Duration: ${finalDuration.toFixed(2)} seconds (target 20.00)`
        );
        console.log(`📁 ${outputFile}`);
        console.log("====================================");

    } catch (err) {
        if (browser) {
            try {
                await browser.close();
            } catch {}
        }

        console.error("\n====================================");
        console.error("❌ PIPELINE FAILURE");
        console.error("====================================");
        console.error(err);

        process.exitCode = 1;
    }
})();