
/* ==========================================
   OBJECT SCOUTER
   GEMINI BACKEND CLIENT
   Render deployment
========================================== */

const APPRAISAL_ENDPOINT = '/api/appraise';

let isScanning = false;


// ==========================================
// CONNECTION STATUS
// ==========================================

function updateGeminiStatus(message, color) {
    const status = document.getElementById('geminiApiStatus');

    if (!status) return;

    status.textContent = message;
    status.className = `font-bold ${color}`;
}


async function checkGeminiConnection() {

    updateGeminiStatus(
        'CHECKING...',
        'text-amber-400'
    );

    try {

        const response = await fetch('/api/health', {
            method: 'GET'
        });

        if (!response.ok) {
            throw new Error('Backend unavailable');
        }

        const result = await response.json();

        if (!result.ok) {
            throw new Error('Gemini configuration unavailable');
        }

        updateGeminiStatus(
            'CONNECTED',
            'text-emerald-400'
        );

    } catch (error) {

        console.error('Connection error:', error);

        updateGeminiStatus(
            'OFFLINE',
            'text-red-400'
        );
    }
}


document.addEventListener('DOMContentLoaded', () => {
    checkGeminiConnection();
});


// ==========================================
// GET SCANNER CANVAS
// ==========================================

function getScannerCanvas() {

    if (typeof canvas !== 'undefined' && canvas) {
        return canvas;
    }

    return document.getElementById('appCanvas');
}


// ==========================================
// MAIN APPRAISAL
// ==========================================

async function appraiseObjectWithGemini() {

    if (isScanning) return;

    const scannerCanvas = getScannerCanvas();

    if (
        !scannerCanvas ||
        scannerCanvas.width <= 0 ||
        scannerCanvas.height <= 0
    ) {
        alert('Camera is not ready. Start your camera first.');
        return;
    }

    isScanning = true;

    const laser =
        document.getElementById('scanningLaser');

    const buttonText =
        document.getElementById('scanBtnText');

    const statusText =
        document.getElementById('scouterStatusTextTop');

    let thumbnail = '';

    try {

        if (typeof initAudioContext === 'function') {
            initAudioContext();
        }

        laser?.classList.remove('hidden');

        if (buttonText) {
            buttonText.textContent = 'APPRAISING...';
        }

        if (statusText) {
            statusText.textContent = 'ANALYZING OBJECT...';
        }

        if (typeof playSynthSound === 'function') {
            playSynthSound(1400, 'sawtooth', 0.2, 0.3);
        }


        // IMAGE CAPTURE

        const maxWidth = 1024;

        const scale = Math.min(
            1,
            maxWidth / scannerCanvas.width
        );

        const imageCanvas = document.createElement('canvas');

        imageCanvas.width = Math.max(
            1,
            Math.round(scannerCanvas.width * scale)
        );

        imageCanvas.height = Math.max(
            1,
            Math.round(scannerCanvas.height * scale)
        );

        const ctx = imageCanvas.getContext('2d');

        if (!ctx) {
            throw new Error('Image processing failed.');
        }

        ctx.drawImage(
            scannerCanvas,
            0,
            0,
            imageCanvas.width,
            imageCanvas.height
        );

        thumbnail = imageCanvas.toDataURL(
            'image/jpeg',
            0.65
        );


        const imageBase64 = thumbnail.split(',')[1];

        if (!imageBase64) {
            throw new Error('Could not capture camera image.');
        }


        // SEND IMAGE TO RENDER BACKEND

        const response = await fetch(
            APPRAISAL_ENDPOINT,
            {
                method: 'POST',

                headers: {
                    'Content-Type': 'application/json'
                },

                body: JSON.stringify({
                    image: imageBase64,
                    mimeType: 'image/jpeg',
                    currency: 'PHP'
                })
            }
        );


        let result;

        try {
            result = await response.json();
        } catch {
            throw new Error('Invalid response from Render server.');
        }

        if (!response.ok) {
            throw new Error(
                result.error || 'Appraisal request failed.'
            );
        }

        if (!result.success || !result.appraisal) {
            throw new Error('No appraisal received.');
        }


        const data = result.appraisal;


        // VALIDATE AND NORMALIZE

        const cleanPrice = value =>
            typeof value === 'number' &&
                Number.isFinite(value) &&
                value >= 0
                ? value
                : null;

        const low = cleanPrice(data.estimatedValueLow);
        const high = cleanPrice(data.estimatedValueHigh);

        const validRanks = [
            'COMMON',
            'C-RANK',
            'A-RANK',
            'S-RANK'
        ];

        const validConditions = [
            'Mint',
            'Excellent',
            'Good',
            'Fair',
            'Poor',
            'Unknown'
        ];

        const validConfidence = [
            'Low',
            'Medium',
            'High'
        ];

        const record = {

            id: 'scan_' + Date.now(),

            timestamp: Date.now(),

            thumbnail,

            objectName:
                String(data.objectName || 'Unknown Object'),

            category:
                String(data.category || 'Unknown Category'),

            brand:
                String(data.brand || 'Unknown'),

            model:
                String(data.model || 'Unknown'),

            rarity:
                validRanks.includes(data.rarity)
                    ? data.rarity
                    : 'COMMON',

            description:
                String(data.description || 'No description available.'),

            condition:
                validConditions.includes(data.condition)
                    ? data.condition
                    : 'Unknown',

            conditionDetails:
                String(data.conditionDetails || 'Not available.'),

            authenticityAssessment:
                String(data.authenticityAssessment || 'Not verified.'),

            estimatedValueLow:
                low !== null && high !== null && high >= low
                    ? low
                    : null,

            estimatedValueHigh:
                low !== null && high !== null && high >= low
                    ? high
                    : null,

            currency: 'PHP',

            valueConfidence:
                validConfidence.includes(data.valueConfidence)
                    ? data.valueConfidence
                    : 'Low',

            valuationNotes:
                String(data.valuationNotes || 'Not available.'),

            issuesDetected:
                String(data.issuesDetected || 'None detected.'),

            solutions:
                String(data.solutions || 'Regular maintenance.'),

            appraisalConfidence:
                validConfidence.includes(data.appraisalConfidence)
                    ? data.appraisalConfidence
                    : 'Low',

            sources: []
        };


        // SAVE TO EXISTING DATABASE

        if (typeof saveScanToDB === 'function') {

            try {
                await saveScanToDB(record);
            } catch (dbError) {
                console.error('Database error:', dbError);
            }
        }


        // DISPLAY RESULT

        displayAppraisalResult(record);

        console.log('APPRAISAL RESULT:', record);

    } catch (error) {

        console.error('APPRAISAL ERROR:', error);

        alert(
            'APPRAISAL ERROR\n\n' +
            error.message
        );

    } finally {

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


// ==========================================
// DISPLAY HELPERS
// ==========================================

function setAppraisalText(id, value) {

    const element = document.getElementById(id);

    if (element) {
        element.textContent =
            value === null || value === undefined
                ? 'Not available'
                : String(value);
    }
}


// ==========================================
// DISPLAY RESULT
// ==========================================

function displayAppraisalResult(record) {

    if (typeof playScanCompleteSound === 'function') {
        playScanCompleteSound();
    }

    setAppraisalText('itemName', record.objectName);
    setAppraisalText('itemClassTag', record.category);
    setAppraisalText('itemRarity', record.rarity);
    setAppraisalText('itemDescription', record.description);

    setAppraisalText('itemBrand', record.brand);
    setAppraisalText('itemModel', record.model);
    setAppraisalText('itemCondition', record.condition);

    setAppraisalText('itemConditionDetails', record.conditionDetails);

    setAppraisalText('itemAuthenticity', record.authenticityAssessment);

    setAppraisalText('itemIssues', record.issuesDetected);
    setAppraisalText('itemSolutions', record.solutions);

    setAppraisalText('itemValueConfidence', record.valueConfidence);

    setAppraisalText('itemAppraisalConfidence', record.appraisalConfidence);

    setAppraisalText('itemValuationNotes', record.valuationNotes);


    // PRICE DISPLAY

    let price = 'Unable to estimate';

    if (
        typeof record.estimatedValueLow === 'number' &&
        typeof record.estimatedValueHigh === 'number'
    ) {

        const formatter = new Intl.NumberFormat('en-PH', {
            style: 'currency',
            currency: 'PHP',
            maximumFractionDigits: 0
        });

        price =
            formatter.format(record.estimatedValueLow) +
            ' - ' +
            formatter.format(record.estimatedValueHigh);
    }

    setAppraisalText('itemEstimatedValue', price);


    // IMAGE

    const thumbnail =
        document.getElementById('appraisalThumbImg');

    if (thumbnail && record.thumbnail) {
        thumbnail.src = record.thumbnail;
    }


    // SOURCES

    const sources =
        document.getElementById('groundingSources');

    if (sources) {
        sources.replaceChildren();
    }


    // SHOW CARD

    document.getElementById('appraisalCard')
        ?.classList.remove('hidden');
}


// ==========================================
// CLOSE CARD
// ==========================================

function closeAppraisalCard() {

    document.getElementById('appraisalCard')
        ?.classList.add('hidden');
}


// ==========================================
// SNAPSHOT EXPORT
// ==========================================

function captureSnapshot() {

    const scannerCanvas = getScannerCanvas();

    if (!scannerCanvas) {
        alert('Camera is unavailable.');
        return;
    }

    const output = document.createElement('canvas');

    output.width = scannerCanvas.width;
    output.height = scannerCanvas.height;

    const ctx = output.getContext('2d');

    if (!ctx) return;

    try {

        ctx.drawImage(scannerCanvas, 0, 0);

        ctx.fillStyle = 'rgba(15,23,42,0.96)';

        ctx.fillRect(20, 20, 520, 260);

        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;

        ctx.strokeRect(20, 20, 520, 260);

        ctx.font = 'bold 18px Orbitron';
        ctx.fillStyle = '#f59e0b';

        ctx.fillText(
            document.getElementById('itemName')?.textContent || 'OBJECT',
            35, 55, 480
        );

        ctx.font = '12px monospace';

        const lines = [
            'CLASS: ' + (document.getElementById('itemClassTag')?.textContent || ''),
            'RARITY: ' + (document.getElementById('itemRarity')?.textContent || ''),
            'VALUE: ' + (document.getElementById('itemEstimatedValue')?.textContent || ''),
            'CONDITION: ' + (document.getElementById('itemCondition')?.textContent || ''),
            'ISSUES: ' + (document.getElementById('itemIssues')?.textContent || ''),
            'SOLUTIONS: ' + (document.getElementById('itemSolutions')?.textContent || '')
        ];

        lines.forEach((line, index) => {

            ctx.fillStyle = index === 2 ? '#f59e0b' : '#38bdf8';

            ctx.fillText(
                line,
                35,
                90 + index * 27,
                480
            );
        });

        const link = document.createElement('a');

        link.download =
            'Scouter_Report_' + Date.now() + '.png';

        link.href = output.toDataURL('image/png');

        link.click();

    } catch (error) {

        console.error('Snapshot error:', error);

        alert('Could not export snapshot.');
    }
}
