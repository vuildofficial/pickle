/**
 * PicklePro Analyzer - AI Analysis Module
 * Handles communication with Claude API for video frame analysis
 */

class PickleballAnalyzer {
    constructor() {
        this.apiKey = null;
        this.baseUrl = 'https://api.anthropic.com/v1/messages';
        this.model = 'claude-sonnet-4-20250514';
    }

    setApiKey(key) {
        this.apiKey = key;
    }

    getApiKey() {
        return this.apiKey || localStorage.getItem('anthropic_api_key');
    }

    /**
     * Build the analysis prompt based on configuration
     */
    buildPrompt(config) {
        const { courtSide, courtPosition, skillLevel, focusAreas } = config;

        const skillDescriptions = {
            beginner: 'beginner (1.0-2.5 rating) who is still learning fundamental mechanics',
            intermediate: 'intermediate player (3.0-3.5 rating) working on consistency and strategy',
            advanced: 'advanced player (4.0-4.5 rating) refining technique and competitive play',
            pro: 'professional-level player (5.0+) seeking elite-level optimization'
        };

        // Build player focus instruction from both dimensions
        let playerFocus;
        const sideDesc = { near: 'near side (bottom of screen/closer to camera)', far: 'far side (top of screen/farther from camera)' };
        const posDesc = { left: 'left-side', right: 'right-side' };

        if (courtSide !== 'auto' && courtPosition !== 'auto') {
            playerFocus = `Focus on the ${posDesc[courtPosition]} player on the ${sideDesc[courtSide]}.`;
        } else if (courtSide !== 'auto') {
            playerFocus = `Focus on the player on the ${sideDesc[courtSide]}.`;
        } else if (courtPosition !== 'auto') {
            playerFocus = `Focus on the ${posDesc[courtPosition]} player.`;
        } else {
            playerFocus = 'Analyze all visible players and provide general feedback.';
        }

        let focusInstructions = '';
        if (focusAreas && focusAreas.length > 0) {
            focusInstructions = `\n\nPay special attention to these areas: ${focusAreas.join(', ')}.`;
        }

        return `You are an expert pickleball coach and video analyst with years of experience coaching players at all levels. Analyze these video frames from a pickleball match and provide specific, actionable coaching feedback.

PLAYER CONTEXT:
- Skill Level: ${skillDescriptions[skillLevel] || skillDescriptions.intermediate}
- Player Focus: ${playerFocus}
${focusInstructions}

ANALYSIS INSTRUCTIONS:
Examine the frames carefully for:

1. **Stroke Mechanics**
   - Paddle preparation and backswing
   - Contact point and paddle angle
   - Follow-through and recovery
   - Grip and wrist position

2. **Footwork & Movement**
   - Split step timing
   - Ready position stance
   - Movement to the ball
   - Recovery steps after shots

3. **Court Positioning**
   - Position relative to the kitchen (non-volley zone)
   - Doubles positioning and spacing with partner
   - Position during serves and returns
   - Transition zone management

4. **Strategy & Shot Selection**
   - Shot selection appropriateness
   - Recognizing attackable balls
   - Patience in dinking rallies
   - Third shot decisions

5. **Body Mechanics**
   - Balance and weight transfer
   - Core engagement
   - Knee bend and athletic stance
   - Head and eye tracking

RESPONSE FORMAT:
Provide your analysis as a JSON object with this structure:
{
    "summary": "2-3 sentence overall assessment of the player's game",
    "strengthsObserved": ["strength 1", "strength 2"],
    "stats": {
        "framesAnalyzed": <number>,
        "tipsGenerated": <number>,
        "priorityAreas": <number>
    },
    "categories": [
        {
            "name": "Category Name",
            "icon": "one of: paddle, footwork, position, strategy, body",
            "tips": [
                {
                    "title": "Specific issue or improvement area",
                    "description": "Detailed explanation of what you observed and why it matters",
                    "priority": "high/medium/low",
                    "drill": "Specific practice drill or exercise to address this"
                }
            ]
        }
    ]
}

Be specific about what you SEE in the frames. Reference actual observations like "I notice your paddle is dropping below the net level during your ready position" rather than generic advice. If you cannot clearly see something, acknowledge that limitation.

Prioritize the most impactful improvements - focus on 2-3 key areas that will make the biggest difference for this player's level.`;
    }

    /**
     * Analyze frames using Claude's vision API
     */
    async analyzeFrames(frames, config, onProgress) {
        const apiKey = this.getApiKey();
        if (!apiKey) {
            throw new Error('API key not configured. Please add your Anthropic API key in settings.');
        }

        if (!frames || frames.length === 0) {
            throw new Error('No frames to analyze. Please capture at least one frame from the video.');
        }

        onProgress?.('Preparing frames for analysis...', 10);

        // Build the message content with images
        const content = [];

        // Add each frame as an image
        for (let i = 0; i < frames.length; i++) {
            const frame = frames[i];

            // Extract base64 data from data URL
            const base64Data = frame.dataUrl.split(',')[1];

            content.push({
                type: 'image',
                source: {
                    type: 'base64',
                    media_type: 'image/jpeg',
                    data: base64Data
                }
            });

            content.push({
                type: 'text',
                text: `Frame ${i + 1} - Timestamp: ${frame.timestamp}`
            });
        }

        // Add the analysis prompt
        content.push({
            type: 'text',
            text: this.buildPrompt(config)
        });

        onProgress?.('Sending to AI for analysis...', 30);

        const maxRetries = 3;
        let lastError = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                if (attempt > 1) {
                    const waitSec = attempt * 5;
                    onProgress?.(`API busy, retrying in ${waitSec}s... (attempt ${attempt}/${maxRetries})`, 30);
                    await new Promise(r => setTimeout(r, waitSec * 1000));
                    onProgress?.(`Retrying analysis (attempt ${attempt}/${maxRetries})...`, 35);
                }

                const response = await fetch(this.baseUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01',
                        'anthropic-dangerous-direct-browser-access': 'true'
                    },
                    body: JSON.stringify({
                        model: this.model,
                        max_tokens: 4096,
                        messages: [
                            {
                                role: 'user',
                                content: content
                            }
                        ]
                    })
                });

                if (response.status === 529 || response.status === 503) {
                    lastError = new Error('API is temporarily overloaded');
                    if (attempt < maxRetries) continue;
                    throw lastError;
                }

                onProgress?.('Processing AI response...', 70);

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.error?.message || `API request failed: ${response.status}`);
                }

                const data = await response.json();

                onProgress?.('Parsing analysis results...', 90);

                const textContent = data.content?.find(c => c.type === 'text');
                if (!textContent) {
                    throw new Error('No analysis text in response');
                }

                const analysisResult = this.parseAnalysisResponse(textContent.text);

                onProgress?.('Analysis complete!', 100);

                return analysisResult;

            } catch (error) {
                lastError = error;
                if (attempt >= maxRetries) {
                    console.error('Analysis error:', error);
                    throw error;
                }
            }
        }
    }

    /**
     * Parse the analysis response and extract JSON
     */
    parseAnalysisResponse(responseText) {
        // Try to find JSON in the response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]);
            } catch (e) {
                console.warn('Failed to parse JSON from response, using fallback');
            }
        }

        // Fallback: create structured response from text
        return this.createFallbackResponse(responseText);
    }

    /**
     * Create a structured response if JSON parsing fails
     */
    createFallbackResponse(text) {
        return {
            summary: text.substring(0, 500),
            strengthsObserved: ['Analysis completed'],
            stats: {
                framesAnalyzed: 0,
                tipsGenerated: 1,
                priorityAreas: 1
            },
            categories: [
                {
                    name: 'General Analysis',
                    icon: 'paddle',
                    tips: [
                        {
                            title: 'AI Analysis',
                            description: text,
                            priority: 'medium',
                            drill: 'Review the analysis above and work on the areas mentioned.'
                        }
                    ]
                }
            ]
        };
    }

    /**
     * Test API connection
     */
    async testConnection() {
        const apiKey = this.getApiKey();
        if (!apiKey) {
            throw new Error('No API key configured');
        }

        const response = await fetch(this.baseUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model: this.model,
                max_tokens: 10,
                messages: [
                    {
                        role: 'user',
                        content: 'Say "OK" to confirm connection.'
                    }
                ]
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || 'Connection test failed');
        }

        return true;
    }
}

// Export as global for use in app.js
window.PickleballAnalyzer = PickleballAnalyzer;
