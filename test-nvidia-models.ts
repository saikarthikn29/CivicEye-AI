async function run() {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    console.error("NVIDIA_API_KEY is not set.");
    return;
  }

  const url = "https://integrate.api.nvidia.com/v1/models";
  console.log("Fetching models with key:", apiKey.substring(0, 10));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json"
      }
    });

    clearTimeout(timeoutId);
    console.log("Response status:", res.status);
    const data = await res.json();
    console.log("Models data keys:", Object.keys(data));
    if (data.data) {
      console.log("First 10 models:", data.data.slice(0, 10).map((m: any) => m.id));
    } else {
      console.log("Response body:", data);
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.error("Fetch models failed:", err.message || err);
  }
}

run();
