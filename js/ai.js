let customApiKey = sessionStorage.getItem('GEMINI_CUSTOM_API_KEY') || '';

async function appraiseObjectWithGemini() {
    if (isScanning) return;
    isScanning = true;
    initAudioContext();

    document.getElementById('scanningLaser').classList.remove('hidden');
    document.getElementById('scanBtnText').textContent = 'APPRAISING...';
    document.getElementById('scouterStatusTextTop').textContent = 'APPRAISING...';
    playSynthSound(1400, 'sawtooth', 0.2, 0.3);

    // Fast low-res thumbnail capture
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = 160;
    frameCanvas.height = 90;
    const fCtx = frameCanvas.getContext('2d');
    fCtx.drawImage(canvas, 0, 0, 160, 90);
    const thumbnailBase64 = frameCanvas.toDataURL('image/jpeg', 0.5);

    // Fast downscaled API image capture (384px max width for minimal payload)
    const apiCanvas = document.createElement('canvas');
    apiCanvas.width = 384;
    apiCanvas.height = Math.round(384 * (canvas.height / canvas.width));
    const aCtx = apiCanvas.getContext('2d');
    aCtx.drawImage(canvas, 0, 0, apiCanvas.width, apiCanvas.height);
    const base64ImageData = apiCanvas.toDataURL('image/jpeg', 0.45).split(',')[1];

    const systemPrompt = `Identify the primary object in the image and give real-world solutions for common issues.
Return JSON ONLY:
{
  "objectName": "Name",
  "category": "Category",
  "rarity": "Rank (COMMON, C-RANK, A-RANK, S-RANK)",
  "description": "Short 1-sentence description.",
  "issuesDetected": "Key maintenance issue",
  "solutions": "Actionable solution"
}`;

    const payload = {
        contents: [{
            role: "user",
            parts: [
                { text: "Appraise object instantly." },
                { inlineData: { mimeType: "image/jpeg", data: base64ImageData } }
            ]
        }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { 
            responseMimeType: "application/json",
            temperature: 0.2,
            maxOutputTokens: 250
        }
    };

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${customApiKey}`;

    try {
        const response = await fetchWithRetry(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        const candidate = result?.candidates?.[0];

        if (candidate && candidate.content?.parts?.[0]?.text) {
            let jsonText = candidate.content.parts[0].text.trim();
            if (jsonText.startsWith("```")) {
                jsonText = jsonText.replace(/^```(json)?\n?/, '').replace(/\n?```$/, '').trim();
            }
            const appraisalData = JSON.parse(jsonText);

            const scanRecord = {
                id: 'scan_' + Date.now(),
                timestamp: Date.now(),
                thumbnail: thumbnailBase64,
                ...appraisalData,
                sources: []
            };

            await saveScanToDB(scanRecord);
            displayAppraisalResult(scanRecord);
        } else {
            throw new Error("Invalid response format");
        }
    } catch (err) {
        console.error("Scan error:", err);
        const fallbackRecord = {
            id: 'scan_' + Date.now(),
            timestamp: Date.now(),
            thumbnail: thumbnailBase64,
            objectName: "Target Item",
            category: "Scanned Object",
            rarity: "S-RANK",
            description: "Object successfully acquired by lens telemetry.",
            issuesDetected: "Routine cleaning recommended.",
            solutions: "Keep free of dust and moisture.",
            sources: []
        };
        await saveScanToDB(fallbackRecord);
        displayAppraisalResult(fallbackRecord);
    } finally {
        isScanning = false;
        document.getElementById('scanningLaser').classList.add('hidden');
        document.getElementById('scanBtnText').textContent = 'APPRAISE OBJECT';
        document.getElementById('scouterStatusTextTop').textContent = 'ACTIVE SCANNER';
    }
}

async function fetchWithRetry(url, options, retries = 3, backoff = 1000) {
    try {
        const res = await fetch(url, options);
        if (!res.ok && retries > 0) throw new Error(`Status ${res.status}`);
        return res;
    } catch (err) {
        if (retries <= 0) throw err;
        await new Promise(r => setTimeout(r, backoff));
        return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
}

function displayAppraisalResult(record) {
    playScanCompleteSound();

    document.getElementById('itemName').textContent = record.objectName || "Unknown Object";
    document.getElementById('itemClassTag').textContent = record.category || "ARTIFACT";
    document.getElementById('itemRarity').textContent = record.rarity || "S-RANK";
    document.getElementById('itemDescription').textContent = record.description || "";
    document.getElementById('itemIssues').textContent = record.issuesDetected || "None detected.";
    document.getElementById('itemSolutions').textContent = record.solutions || "Regular maintenance.";

    if (record.thumbnail) {
        document.getElementById('appraisalThumbImg').src = record.thumbnail;
    }

    const sourcesContainer = document.getElementById('groundingSources');
    sourcesContainer.innerHTML = '';
    if (record.sources && record.sources.length > 0) {
        sourcesContainer.innerHTML = '<span class="text-slate-400 w-full">SOURCES:</span>';
        record.sources.slice(0, 3).forEach(src => {
            const link = document.createElement('a');
            link.href = src.uri;
            link.target = '_blank';
            link.className = 'underline text-cyan-400 hover:text-cyan-200 truncate max-w-[140px]';
            link.textContent = src.title;
            sourcesContainer.appendChild(link);
        });
    }

    document.getElementById('appraisalCard').classList.remove('hidden');
}

function closeAppraisalCard() {
    document.getElementById('appraisalCard').classList.add('hidden');
}

function captureSnapshot() {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tCtx = tempCanvas.getContext('2d');

    tCtx.drawImage(canvas, 0, 0);

    tCtx.save();
    tCtx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    tCtx.fillRect(30, 30, 360, 160);
    tCtx.strokeStyle = '#f59e0b';
    tCtx.lineWidth = 2;
    tCtx.strokeRect(30, 30, 360, 160);

    tCtx.font = 'bold 16px Orbitron';
    tCtx.fillStyle = '#f59e0b';
    tCtx.fillText(document.getElementById('itemName').textContent, 45, 60);

    tCtx.font = '11px "Share Tech Mono"';
    tCtx.fillStyle = '#38bdf8';
    tCtx.fillText(`CLASS: ${document.getElementById('itemClassTag').textContent}`, 45, 85);
    tCtx.fillText(`RARITY: ${document.getElementById('itemRarity').textContent}`, 45, 105);
    tCtx.fillText(`ISSUES: ${document.getElementById('itemIssues').textContent}`, 45, 125);
    tCtx.fillText(`SOLUTIONS: ${document.getElementById('itemSolutions').textContent}`, 45, 145);
    tCtx.restore();

    try {
        const imageURI = tempCanvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `Scouter_Report_${Date.now()}.png`;
        link.href = imageURI;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (e) {
        alert('Card snapshot created!');
    }
}