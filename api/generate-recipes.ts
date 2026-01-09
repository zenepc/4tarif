// Vercel serverless function: /api/generate-recipes

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Sadece POST isteklerine izin veriliyor" }),
      {
        status: 405,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }

  try {
    const { ingredients } = await req.json();

    if (!ingredients || typeof ingredients !== "string" || ingredients.trim() === "") {
      return new Response(
        JSON.stringify({ error: "Lütfen malzeme listesi girin" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }

    const SPOONACULAR_API_KEY = process.env.SPOONACULAR_API_KEY;

    if (!SPOONACULAR_API_KEY) {
      console.error("SPOONACULAR_API_KEY is not configured");
      return new Response(
        JSON.stringify({
          error:
            "Tarif servisi yapılandırılmamış. Lütfen SPOONACULAR_API_KEY ortam değişkenini ayarlayın.",
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }

    const userIngredientsList = ingredients
      .toLowerCase()
      .split(/[,\n]+/)
      .map((i: string) => i.trim())
      .filter((i: string) => i);

    console.log(
      "Calling Spoonacular API with ingredients:",
      userIngredientsList.join(", "),
    );

    // 1) Kullanıcı malzemeleriyle tarif ID'lerini ve temel bilgileri al
    const searchUrl = new URL(
      "https://api.spoonacular.com/recipes/findByIngredients",
    );
    searchUrl.searchParams.append("apiKey", SPOONACULAR_API_KEY);
    searchUrl.searchParams.append("ingredients", userIngredientsList.join(","));
    searchUrl.searchParams.append("number", "4"); // En fazla 4 tarif
    searchUrl.searchParams.append("ranking", "1");
    searchUrl.searchParams.append("ignorePantry", "true");

    const response = await fetch(searchUrl.toString());

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "Spoonacular API error (findByIngredients):",
        response.status,
        errorText,
      );

      if (response.status === 429) {
        return new Response(
          JSON.stringify({
            error: "Çok fazla istek gönderildi. Lütfen biraz bekleyin.",
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          },
        );
      }

      if (response.status === 401 || response.status === 403) {
        return new Response(
          JSON.stringify({
            error:
              "Tarif servisi yetkilendirme hatası. API anahtarını kontrol edin.",
          }),
          {
            status: 401,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          },
        );
      }

      return new Response(
        JSON.stringify({
          error: "Tarif servisi hatası (findByIngredients)",
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }

    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      return new Response(
        JSON.stringify({
          error:
            "Bu malzemelerle tarif bulunamadı. Farklı malzemeler deneyin.",
        }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }

    // 2) Her tarif için detay ve besin bilgilerini al
    const recipeIds = data.slice(0, 4).map((r: any) => r.id);

    const detailResponses = await Promise.all(
      recipeIds.map((id: number) =>
        fetch(
          `https://api.spoonacular.com/recipes/${id}/information?includeNutrition=true&apiKey=${SPOONACULAR_API_KEY}`,
        ),
      ),
    );

    const detailData = await Promise.all(detailResponses.map((res) => res.json()));

    // 3) Spoonacular'dan gelen tarifleri uygulamanın formatına dönüştür
    const userIngredientsLower = userIngredientsList.map((i) => i.toLowerCase());

    const recipes = detailData.map((detail: any, index: number) => {
      const basic = data[index];

      // Mutfak türünü belirle
      const cuisine = detail.cuisines?.[0]
        ? detail.cuisines[0].charAt(0).toUpperCase() +
          detail.cuisines[0].slice(1) +
          " Mutfağı"
        : "Dünya Mutfağı";

      // Malzeme listesi
      const extendedIngredients = Array.isArray(detail.extendedIngredients)
        ? detail.extendedIngredients
        : [];

      const ingredientsList = extendedIngredients.map((ing: any) => {
        const name = ing.originalString || ing.name || "";
        const ingLower = name.toLowerCase();
        const ingWords = ingLower
          .split(/[^a-z0-9ığüşöçİĞÜŞÖÇ]+/i)
          .filter(Boolean);

        const isAvailable = userIngredientsLower.some((userIng) => {
          const userWords = userIng.split(/\s+/).filter(Boolean);
          return (
            userWords.length > 0 &&
            userWords.every(
              (word) =>
                ingWords.includes(word) || ingWords.some((w) => w.startsWith(word)),
            )
          );
        });

        return {
          name,
          available: isAvailable,
        };
      });

      // Hazırlama adımları
      const steps =
        detail.analyzedInstructions?.[0]?.steps &&
        Array.isArray(detail.analyzedInstructions[0].steps)
          ? detail.analyzedInstructions[0].steps.map((s: any) => s.step).filter(Boolean)
          : [];

      const preparation =
        steps.length > 0
          ? steps
          : [
              "Fırını/ocağı tarifte belirtilen sıcaklığa getirin.",
              "Malzemeleri hazırlayın ve doğrayın.",
              "Tarif talimatlarına göre pişirin.",
              "Servis edin.",
            ];

      // Beslenme bilgileri
      const nutrients = Array.isArray(detail.nutrition?.nutrients)
        ? detail.nutrition.nutrients
        : [];

      const getNutrient = (name: string) => {
        const n = nutrients.find((nu: any) => nu.name === name);
        if (!n || typeof n.amount !== "number") return "N/A";
        const unit = n.unit || "g";
        return `${Math.round(n.amount)}${unit}`;
      };

      const nutrition = {
        protein: getNutrient("Protein"),
        carbohydrate: getNutrient("Carbohydrates"),
        fat: getNutrient("Fat"),
      };

      // Yanına ne gider (pairing) – basit bir açıklama
      const dishType = detail.dishTypes?.[0];
      const pairing = dishType
        ? `Bu ${dishType} yanında hafif bir salata veya içecek ile servis edilebilir.`
        : "Bu yemeği yan ürünler ve içeceklerle damak zevkinize göre eşleştirebilirsiniz.";

      return {
        cuisine,
        title: detail.title || "Tarif",
        ingredients: ingredientsList,
        preparation,
        nutrition,
        pairing,
        sourceUrl: detail.sourceUrl || detail.spoonacularSourceUrl || null,
        image: detail.image || null,
      };
    });

    return new Response(JSON.stringify({ recipes }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Error in generate-recipes function:", error);
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error ? error.message : "Tarif oluşturulurken bir hata oluştu",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }
}

