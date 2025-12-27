export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { imageData } = req.body;

  if (!imageData) {
    return res.status(400).json({ error: 'No image data provided' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: imageData
                }
              },
              {
                type: 'text',
                text: text: 'このスクリーンショットから商品の買取価格情報を抽出し、以下の形式の正しいJSONのみを返してください。他の文字は一切出力しないでください:\n\n{"productName":"商品名","productCode":"商品コード","quantity":"数量","purchasePrice":"購入価格","shops":[{"name":"ショップ名","buyPrice":18500,"profit":0,"timeAgo":"5376時間前"}]}\n\n重要:\n- 買取価格0の店舗は除外\n- 数値は数値型で\n- JSON以外の文字は絶対に出力しない'
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error:', errorText);
      return res.status(response.status).json({ 
        error: `API error: ${response.status}`,
        details: errorText 
      });
    }

    const data = await response.json();
    
    const textContent = data.content
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .join('');

    if (!textContent) {
      return res.status(500).json({ error: 'Empty response from API' });
    }

    console.log('Raw response:', textContent);

    let jsonText = textContent.trim();
    jsonText = jsonText.replace(/```json\s*/g, '').replace(/```\s*/g, '');
    jsonText = jsonText.trim();
    
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Could not find JSON in response:', textContent.substring(0, 200));
      return res.status(500).json({ 
        error: 'Could not extract JSON from response',
        response: textContent.substring(0, 200)
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      return res.status(500).json({ 
        error: 'Invalid JSON format',
        details: parseError.message,
        sample: jsonMatch[0].substring(0, 200)
      });
    }

    if (!parsed.productName) {
      return res.status(500).json({ error: 'Missing productName in response' });
    }
    
    if (!Array.isArray(parsed.shops)) {
      return res.status(500).json({ error: 'shops is not an array' });
    }

    parsed.shops = parsed.shops.map(shop => ({
      ...shop,
      buyPrice: typeof shop.buyPrice === 'string' ? parseInt(shop.buyPrice.replace(/,/g, '')) : shop.buyPrice,
      profit: typeof shop.profit === 'string' ? parseInt(shop.profit.replace(/,/g, '')) : shop.profit
    }));

    return res.status(200).json(parsed);

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
