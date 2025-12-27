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
                text: `このスクリーンショットから商品の買取価格情報を抽出してください。

以下のJSON形式で返してください（他の説明は一切不要、JSONのみ）：

{
  "productName": "商品名（完全な名前）",
  "productCode": "商品コード",
  "quantity": "数量",
  "purchasePrice": "購入価格",
  "shops": [
    {
      "name": "ショップ名",
      "buyPrice": 買取価格（数値、カンマなし）,
      "profit": 利益額（数値、マイナスも含む）,
      "timeAgo": "取得時間"
    }
  ]
}

重要：
- 買取価格が0の店舗は含めない
- 数値は必ず数値型で（文字列ではなく）
- JSONのみを出力（説明文、マークダウン記号などは不要）`
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

    let jsonText = textContent;
    jsonText = jsonText.replace(/```json\s*/g, '').replace(/```\s*/g, '');

    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ 
        error: 'Could not extract JSON',
        response: textContent.substring(0, 200)
      });
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.productName || !Array.isArray(parsed.shops)) {
      return res.status(500).json({ error: 'Invalid data format' });
    }

    return res.status(200).json(parsed);

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
