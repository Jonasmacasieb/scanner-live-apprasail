
let customApiKey = sessionStorage.getItem('GEMINI_CUSTOM_API_KEY') || '';

const GEMINI_MODEL = 'gemini-3-flash-preview';
const GEMINI_API_URL =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

async function appraiseObjectWithGemini() {
    if (isScanning) return;

    if (!customApiKey) {
        alert('Please enter your Gemini API key first.');
        return;
    }

    if (!canvas || !canvas.width || !canvas.height) {
        alert('Camera image is not ready. Please try again.');
        return;
    }

    isScanning = true;
    initAudioContext();

    const laser = document.getElementById('scanningLaser');
    const buttonText = document.getElementById('scanBtnText');
    const statusText = document.getElementById('scouterStatusTextTop');

    let thumbnailBase64 = '';

    try {
        // Start scanning animation
        laser?.classList.remove('hidden');

        if (buttonText) buttonText.textContent = 'APPRAISING...';
        if (statusText) statusText.textContent = 'ANALYZING OBJECT...';

        playSynthSound(1400, 'sawtooth', 0.2, 0.3);

        // Capture thumbnail
        const frameCanvas = document.createElement('canvas');
        frameCanvas.width = 160;
        frameCanvas.height = 90;

        const fCtx = frameCanvas.getContext('2d');

        if (!fCtx) throw new Error('Cannot create thumbnail canvas.');

        fCtx.drawImage(canvas, 0, 0, 160, 90);

        thumbnailBase64 = frameCanvas.toDataURL('image/jpeg', 0.6);

        // Capture optimized API image
        const maxWidth = 768;
        const scale = Math.min(1, maxWidth / canvas.width);

        const apiCanvas = document.createElement('canvas');

        apiCanvas.width = Math.round(canvas.width * scale);
        apiCanvas.height = Math.round(canvas.height * scale);

        const aCtx = apiCanvas.getContext('2d');

        if (!aCtx) throw new Error('Cannot create API image canvas.');

        aCtx.drawImage(
            canvas,
            0,
            0,
            apiCanvas.width,
            apiCanvas.height
        );

        const base64ImageData = apiCanvas
            .toDataURL('image/jpeg', 0.65)
            .split(',')[1];

        if (!base64ImageData) {
            throw new Error('Failed to capture camera image.');
        }

        // AI instructions
        const systemPrompt = `
You are an expert visual object identification and condition assessment AI.

Analyze the uploaded image carefully.

Identify the primary visible object and provide a realistic assessment.

IMPORTANT:
- Do not invent details that cannot be seen.
- If the object cannot be identified, say so.
- Do not claim an object is rare without visual evidence.
- Do not confuse fictional rarity rankings with actual market value.
- Describe only visible damage or reasonably identifiable maintenance concerns.
- If an issue cannot be determined from the image, say "Cannot determine from image."

Return valid JSON only, using this exact structure:

{
    "objectName": "Object name",
    "category": "Object category",
    "rarity": "COMMON, C-RANK, A-RANK, or S-RANK",
    "description": "One-sentence object description.",
    "issuesDetected": "Visible damage or maintenance concerns.",
    "solutions": "Practical maintenance or repair recommendations."
}

Rarity guidelines:
COMMON = Ordinary or widely available object.
C-RANK = Some distinctive characteristics.
A-RANK = Unusual or notable characteristics.
S-RANK = Exceptional characteristics supported by visual evidence.

If uncertain, use COMMON.
`;

        const payload = {
            contents: [{
                role: 'user',
                parts: [
                    {
                        text: 'Identify and appraise the primary object in this image.'
                    },
                    {
                        inlineData: {
                            mimeType: 'image/jpeg',
                            data: base64ImageData
                        }
                    }
                ]
            }],

            systemInstruction: {
                parts: [{ text: systemPrompt }]
            },

            generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0.2,
                maxOutputTokens: 400
            }
        };

        // Send request to Gemini
        const apiUrl = `${GEMINI_API_URL}?key=${encodeURIComponent(customApiKey)}`;

        const response = await fetchWithRetry(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!response.ok) {
            const errorMessage =
                result?.error?.message ||
                `Gemini API error: ${response.status}`;

            throw new Error(errorMessage);
        }

        // Extract AI response
        const candidate = result?.candidates?.[0];

        if (!candidate) {
            throw new Error(
                result?.promptFeedback?.blockReason
                    ? `Request blocked: ${result.promptFeedback.blockReason}`
                    : 'Gemini returned no appraisal result.'
            );
        }

        const jsonText = candidate.content?.parts
            ?.map(part => part.text || '')
            .join('')
            .trim();

        if (!jsonText) {
            throw new Error('Gemini returned an empty response.');
        }

        // Parse JSON safely
        let appraisalData;

        try {
            appraisalData = JSON.parse(
                jsonText
                    .replace(/^```(?:json)?\s*/i, '')
                    .replace(/\s*```$/, '')
                    .trim()
            );
        } catch {
            throw new Error('Gemini returned invalid JSON. Please scan again.');
        }

        // Validate required fields
        const requiredFields = [
            'objectName',
            'category',
            'rarity',
            'description',
            'issuesDetected',
            'solutions'
        ];

        for (const field of requiredFields) {
            if (
                typeof appraisalData[field] !== 'string' ||
                !appraisalData[field].trim()
            ) {
                throw new Error(`Missing or invalid appraisal field: ${field}`);
            }
        }

        const validRanks = ['COMMON', 'C-RANK', 'A-RANK', 'S-RANK'];

        if (!validRanks.includes(appraisalData.rarity)) {
            appraisalData.rarity = 'COMMON';
        }

        // Create appraisal record
        const scanRecord = {
            id: 'scan_' + Date.now(),
            timestamp: Date.now(),
            thumbnail: thumbnailBase64,

            objectName: appraisalData.objectName,
            category: appraisalData.category,
            rarity: appraisalData.rarity,
            description: appraisalData.description,
            issuesDetected: appraisalData.issuesDetected,
            solutions: appraisalData.solutions,

            sources: []
        };

        // Save to database and display
        await saveScanToDB(scanRecord);

        displayAppraisalResult(scanRecord);

        console.log('Appraisal successful:', scanRecord);

    } catch (err) {
        console.error('Appraisal error:', err);

        alert(
            'APPRAISAL FAILED\n\n' +
            (err.message || 'An unexpected error occurred.') +
            '\n\nPlease check your API key and try again.'
        );

    } finally {
        // Always restore scanner interface
        isScanning = false;

        laser?.classList.add('hidden');

        if (buttonText) {
            buttonText.textContent = 'APPRAISE OBJECT';
        }

        if (statusText) {
            statusText.textContent = 'ACTIVE SCANNER';
        }
    }
}


// Improved API retry system
async function fetchWithRetry(
    url,
    options,
    retries = 3,
    backoff = 1000
) {
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const response = await fetch(url, options);

            // Retry only temporary server/rate-limit errors
            if (
                [429, 500, 502, 503, 504].includes(response.status) &&
                attempt < retries
            ) {
                await new Promise(resolve =>
                    setTimeout(resolve, backoff * Math.pow(2, attempt))
                );

                continue;
            }

            return response;

        } catch (error) {
            lastError = error;

            if (attempt >= retries) {
                throw error;
            }

            await new Promise(resolve =>
                setTimeout(resolve, backoff * Math.pow(2, attempt))
            );
        }
    }

    throw lastError || new Error('Network request failed.');
}


// Display appraisal result
function displayAppraisalResult(record) {
    playScanCompleteSound();

    document.getElementById('itemName').textContent =
        record.objectName || 'Unknown Object';

    document.getElementById('itemClassTag').textContent =
        record.category || 'ARTIFACT';

    document.getElementById('itemRarity').textContent =
        record.rarity || 'COMMON';

    document.getElementById('itemDescription').textContent =
        record.description || '';

    document.getElementById('itemIssues').textContent =
        record.issuesDetected || 'None detected.';

    document.getElementById('itemSolutions').textContent =
        record.solutions || 'Regular maintenance recommended.';

    if (record.thumbnail) {
        document.getElementById('appraisalThumbImg').src =
            record.thumbnail;
    }

    // Display grounding sources safely
    const sourcesContainer =
        document.getElementById('groundingSources');

    sourcesContainer.replaceChildren();

    if (record.sources?.length > 0) {
        const heading = document.createElement('span');

        heading.className = 'text-slate-400 w-full';
        heading.textContent = 'SOURCES:';

        sourcesContainer.appendChild(heading);

        record.sources.slice(0, 3).forEach(src => {
            if (!src.uri) return;

            const link = document.createElement('a');

            link.href = src.uri;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.className =
                'underline text-cyan-400 hover:text-cyan-200 truncate max-w-[140px]';

            link.textContent = src.title || 'View Source';

            sourcesContainer.appendChild(link);
        });
    }

    document.getElementById('appraisalCard')
        .classList.remove('hidden');
}


// Close appraisal card
function closeAppraisalCard() {
    document.getElementById('appraisalCard')
        .classList.add('hidden');
}


// Capture appraisal snapshot
function captureSnapshot() {
    const tempCanvas = document.createElement('canvas');

    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;

    const tCtx = tempCanvas.getContext('2d');

    if (!tCtx) {
        alert('Unable to create snapshot.');
        return;
    }

    tCtx.drawImage(canvas, 0, 0);

    // Appraisal information panel
    const panelX = 30;
    const panelY = 30;
    const panelWidth = Math.min(500, tempCanvas.width - 60);
    const panelHeight = 190;

    tCtx.save();

    tCtx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    tCtx.fillRect(panelX, panelY, panelWidth, panelHeight);

    tCtx.strokeStyle = '#f59e0b';
    tCtx.lineWidth = 2;

    tCtx.strokeRect(panelX, panelY, panelWidth, panelHeight);

    tCtx.font = 'bold 16px Orbitron';
    tCtx.fillStyle = '#f59e0b';

    tCtx.fillText(
        document.getElementById('itemName').textContent,
        panelX + 15,
        panelY + 30,
        panelWidth - 30
    );

    tCtx.font = '11px "Share Tech Mono"';
    tCtx.fillStyle = '#38bdf8';

    const details = [
        'CLASS: ' + document.getElementById('itemClassTag').textContent,
        'RARITY: ' + document.getElementById('itemRarity').textContent,
        'ISSUES: ' + document.getElementById('itemIssues').textContent,
        'SOLUTIONS: ' + document.getElementById('itemSolutions').textContent
    ];

    details.forEach((line, index) => {
        tCtx.fillText(
            line,
            panelX + 15,
            panelY + 60 + (index * 27),
            panelWidth - 30
        );
    });

    tCtx.restore();

    try {
        const imageURI = tempCanvas.toDataURL('image/png');

        const link = document.createElement('a');

        link.download = `Scouter_Report_${Date.now()}.png`;
        link.href = imageURI;

        document.body.appendChild(link);
        link.click();
        link.remove();

    } catch (error) {
        console.error('Snapshot error:', error);
        alert('Unable to export snapshot.');
    }
}