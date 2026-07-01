import dotenv from "dotenv";
dotenv.config();

async function analyzeWithNvidiaNim(cleanBase64: string, mimeType: string, apiKey: string) {
  const modelName = "meta/llama-3.2-90b-vision-instruct";
  console.log(`[CIVICEYE] Invoking NVIDIA NIM API using model: ${modelName}...`);
  
  const prompt = `You are an expert urban infrastructure inspection AI.
Analyze the uploaded image and classify it into exactly one category:
* Pothole
* Road Damage
* Water Leakage
* Drainage Problem
* Garbage
* Illegal Dumping
* Damaged Streetlight
* Electrical Hazard
* Broken Footpath
* Other

Evaluate the visible infrastructure defects in the image and maximize classification accuracy.
If NO civic issue or infrastructure issue is detected (e.g. it is a selfie, blank image, indoor random picture, food, etc.), please set category to "Other" and set isInvalidImage: true.

Return a JSON object matching this exact schema:
{
  "category": "Pothole" | "Road Damage" | "Water Leakage" | "Drainage Problem" | "Garbage" | "Illegal Dumping" | "Damaged Streetlight" | "Electrical Hazard" | "Broken Footpath" | "Other",
  "severity": "Low" | "Medium" | "High" | "Critical",
  "confidence": number,
  "department": "Roads" | "Water" | "Electrical" | "Sanitation",
  "priorityScore": number,
  "description": "A concise, clear 1-2 sentence description of the observed issue.",
  "suggestedAction": "Suggested corrective action that civic authorities should take.",
  "estimatedImpact": "Short explanation of the potential impact on safety, traffic, or public health.",
  "isInvalidImage": boolean
}

Do not include any Markdown wrap. Just the clean JSON string.`;

  const url = "https://integrate.api.nvidia.com/v1/chat/completions";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType || "image/jpeg"};base64,${cleanBase64}`
              }
            }
          ]
        }
      ],
      max_tokens: 1024,
      temperature: 0.1
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`NVIDIA NIM API error (${response.status}): ${errText}`);
  }

  const resultData: any = await response.json();
  const choiceText = resultData.choices?.[0]?.message?.content || "";
  return choiceText;
}

async function run() {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    console.error("NVIDIA_API_KEY not configured");
    return;
  }
  const testBase64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  try {
    const res = await analyzeWithNvidiaNim(testBase64, "image/gif", apiKey);
    console.log("Success! Response:", res);
  } catch (err: any) {
    console.error("Error calling analyzeWithNvidiaNim:", err.message || err);
  }
}

run();
