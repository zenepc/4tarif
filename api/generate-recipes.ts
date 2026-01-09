// Vercel serverless function: /api/generate-recipes
// Groq LLM tabanlı tarif üretici (Node-style handler)

export default async function handler(req: any, res: any) {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res
      .status(204)
      .setHeader("Access-Control-Allow-Origin", "*")
      .setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
      .setHeader("Access-Control-Allow-Headers", "Content-Type")
      .end();
    return;
  }

  if (req.method !== "POST") {
    res
      .status(405)
      .setHeader("Access-Control-Allow-Origin", "*")
      .json({ error: "Sadece POST isteklerine izin veriliyor" });
    return;
  }

  try {
    const { ingredients } = req.body || {};

    if (!ingredients || typeof ingredients !== "string" || ingredients.trim() === "") {
      res
        .status(400)
        .setHeader("Access-Control-Allow-Origin", "*")
        .json({ error: "Lütfen malzeme listesi girin" });
      return;
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
      console.error("GROQ_API_KEY is not configured");
      res
        .status(500)
        .setHeader("Access-Control-Allow-Origin", "*")
        .json({
          error:
            "Tarif servisi yapılandırılmamış. Lütfen GROQ_API_KEY ortam değişkenini ayarlayın.",
        });
      return;
    }

    const userIngredientsList = ingredients
      .toLowerCase()
      .split(/[,\n]+/)
      .map((i: string) => i.trim())
      .filter((i: string) => i);

    const systemPrompt = `Sen profesyonel bir aşçısın. Kullanıcının verdiği malzemelerle yapılabilecek GERÇEK ve OTANTİK tarifler öneriyorsun.

ÖNEMLİ KURALLAR:
- Tarifleri uydurmadan, gerçek dünya tariflerinden seç
- Her tarif kendi mutfağına (cuisine) uygun ve otantik olmalı
- Kullanıcının verdiği TÜM malzemeleri mümkün olduğunca kullan, hiçbirini boşa bırakma
- 4 tarif birbirinden TAMAMEN FARKLI olsun (farklı pişirme teknikleri, farklı lezzet profilleri)
- Malzemelerde kullanıcının verdiği malzemeler "available: true", eklenmesi gereken malzemeler "available: false" olarak işaretle
- Malzeme miktarlarını belirt (örn: "2 adet domates", "1 yemek kaşığı zeytinyağı")
- Hazırlama adımlarında pişirme sürelerini belirt (örn: "10 dakika kavurun", "20 dakika fırında pişirin")

MUTLAKA aşağıdaki JSON formatında yanıt ver, başka hiçbir şey ekleme:

{
  "recipes": [
    {
      "cuisine": "Türk Mutfağı / İtalyan vb.",
      "title": "Yemeğin Adı",
      "ingredients": [
        {"name": "2 adet domates", "available": true},
        {"name": "1 yemek kaşığı zeytinyağı", "available": false}
      ],
      "preparation": ["Adım 1", "Adım 2"],
      "nutrition": {
        "protein": "15g",
        "carbohydrate": "30g",
        "fat": "10g"
      },
      "pairing": "Bu yemeğin yanında ... iyi gider."
    }
  ]
}

Kullanıcının verdiği malzemeler: ${userIngredientsList.join(", ")}

Tam olarak 4 farklı tarif öner. Her tarif farklı bir tarzda olsun.`;

    console.log("Calling Groq AI with ingredients:", ingredients);

    const groqRes = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Elimdeki malzemeler: ${ingredients}` },
          ],
          temperature: 0.7,
        }),
      },
    );

    if (!groqRes.ok) {
      const errorText = await groqRes.text();
      console.error("Groq API error:", groqRes.status, errorText);

      if (groqRes.status === 429) {
        res
          .status(429)
          .setHeader("Access-Control-Allow-Origin", "*")
          .json({
            error: "Çok fazla istek gönderildi. Lütfen biraz bekleyin.",
          });
        return;
      }

      res
        .status(500)
        .setHeader("Access-Control-Allow-Origin", "*")
        .json({ error: "Tarif servisi hatası (Groq)" });
      return;
    }

    const data = await groqRes.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error("No content in Groq response");
      res
        .status(500)
        .setHeader("Access-Control-Allow-Origin", "*")
        .json({ error: "Tarif servisi yanıt vermedi" });
      return;
    }

    console.log("Groq response content:", content);

    let jsonString = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonString = jsonMatch[1];
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonString.trim());
    } catch (err) {
      console.error("JSON parse error:", err, "Content:", jsonString);
      res
        .status(500)
        .setHeader("Access-Control-Allow-Origin", "*")
        .json({
          error:
            "Tarifler oluşturulurken bir hata oluştu. Lütfen tekrar deneyin.",
        });
      return;
    }

    const recipesRaw = parsed?.recipes;
    if (!Array.isArray(recipesRaw) || recipesRaw.length === 0) {
      res
        .status(500)
        .setHeader("Access-Control-Allow-Origin", "*")
        .json({
          error: "Geçerli tarif bulunamadı. Lütfen tekrar deneyin.",
        });
      return;
    }

    const recipes = recipesRaw.slice(0, 4).map((recipe: any) => ({
      cuisine: recipe.cuisine || "Dünya Mutfağı",
      title: recipe.title || "Tarif",
      ingredients: Array.isArray(recipe.ingredients)
        ? recipe.ingredients.map((ing: any) =>
            typeof ing === "string"
              ? { name: ing, available: true }
              : {
                  name: ing.name || String(ing),
                  available:
                    typeof ing.available === "boolean" ? ing.available : true,
                },
          )
        : [],
      preparation: Array.isArray(recipe.preparation)
        ? recipe.preparation
        : [],
      nutrition: {
        protein: recipe.nutrition?.protein || "N/A",
        carbohydrate: recipe.nutrition?.carbohydrate || "N/A",
        fat: recipe.nutrition?.fat || "N/A",
      },
      pairing: recipe.pairing || null,
    }));

    res
      .status(200)
      .setHeader("Access-Control-Allow-Origin", "*")
      .json({ recipes });
  } catch (error) {
    console.error("Error in generate-recipes function:", error);
    res
      .status(500)
      .setHeader("Access-Control-Allow-Origin", "*")
      .json({
        error:
          error instanceof Error ? error.message : "Tarif oluşturulurken bir hata oluştu",
      });
  }
}
