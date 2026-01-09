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

    const USDA_API_KEY = process.env.USDA_API_KEY;

    if (!USDA_API_KEY) {
      console.error("USDA_API_KEY is not configured");
      // Makrolar eksik olsa bile tarifleri gösterebilmek için burada hata fırlatmıyoruz.
    }

    const userIngredientsList = ingredients
      .toLowerCase()
      .split(/[,\n]+/)
      .map((i: string) => i.trim())
      .filter((i: string) => i);

    const firstIngredient = userIngredientsList[0];
    if (!firstIngredient) {
      return new Response(
        JSON.stringify({ error: "Lütfen en az bir malzeme girin" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }

    console.log("Calling TheMealDB with ingredient:", firstIngredient);

    // 1) TheMealDB: ilk malzemeye göre tarif listesi
    const filterUrl = `https://www.themealdb.com/api/json/v1/1/filter.php?i=${encodeURIComponent(
      firstIngredient,
    )}`;

    const filterRes = await fetch(filterUrl);
    if (!filterRes.ok) {
      const txt = await filterRes.text();
      console.error("TheMealDB filter error:", filterRes.status, txt);
      return new Response(
        JSON.stringify({ error: "Tarif servisi hatası (TheMealDB filter)" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }

    const filterData = await filterRes.json();
    if (!filterData.meals || !Array.isArray(filterData.meals) || filterData.meals.length === 0) {
      return new Response(
        JSON.stringify({
          error:
            "Bu malzemeyle TheMealDB üzerinde tarif bulunamadı. Farklı malzemeler deneyin.",
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

    const mealsBasic = filterData.meals.slice(0, 4);

    // 2) Seçilen tariflerin detaylarını al
    const detailResponses = await Promise.all(
      mealsBasic.map((m: any) =>
        fetch(
          `https://www.themealdb.com/api/json/v1/1/lookup.php?i=${encodeURIComponent(
            m.idMeal,
          )}`,
        ),
      ),
    );

    const detailJsons = await Promise.all(detailResponses.map((r) => r.json()));
    const mealDetails = detailJsons
      .map((d) => (Array.isArray(d.meals) ? d.meals[0] : null))
      .filter(Boolean);

    const userIngredientsLower = userIngredientsList.map((i) => i.toLowerCase());

    // USDA FoodData Central'dan makro bilgileri getir
    async function fetchNutritionFromUSDA(mealName: string) {
      if (!USDA_API_KEY) {
        return {
          protein: "N/A",
          carbohydrate: "N/A",
          fat: "N/A",
        };
      }

      try {
        const searchUrl = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
        searchUrl.searchParams.append("api_key", USDA_API_KEY);
        searchUrl.searchParams.append("query", mealName);
        searchUrl.searchParams.append("pageSize", "1");

        const usdaRes = await fetch(searchUrl.toString());
        if (!usdaRes.ok) {
          const txt = await usdaRes.text();
          console.error("USDA search error:", usdaRes.status, txt);
          return {
            protein: "N/A",
            carbohydrate: "N/A",
            fat: "N/A",
          };
        }

        const usdaData = await usdaRes.json();

        const food =
          Array.isArray(usdaData.foods) && usdaData.foods.length > 0
            ? usdaData.foods[0]
            : null;
        if (!food || !Array.isArray(food.foodNutrients)) {
          return {
            protein: "N/A",
            carbohydrate: "N/A",
            fat: "N/A",
          };
        }

        const getVal = (names: string[]) => {
          const n = food.foodNutrients.find((fn: any) =>
            names.some((name) => fn.nutrientName?.toLowerCase().includes(name.toLowerCase())),
          );
          if (!n || typeof n.value !== "number") return "N/A";
          return `${Math.round(n.value)}g`;
        };

        return {
          protein: getVal(["Protein"]),
          carbohydrate: getVal(["Carbohydrate", "Carbohydrates, by difference"]),
          fat: getVal(["Total lipid (fat)", "Fat"]),
        };
      } catch (e) {
        console.error("USDA fetch error:", e);
        return {
          protein: "N/A",
          carbohydrate: "N/A",
          fat: "N/A",
        };
      }
    }

    // 3) Uygulamanın recipe formatına dönüştür
    const recipes = await Promise.all(
      mealDetails.map(async (meal: any) => {
        const title = meal.strMeal as string;
        const cuisine = meal.strArea ? `${meal.strArea} Mutfağı` : "Dünya Mutfağı";

        const ingredientsList: { name: string; available: boolean }[] = [];
        for (let i = 1; i <= 20; i++) {
          const ing = meal[`strIngredient${i}`];
          const measure = meal[`strMeasure${i}`];
          if (ing && ing.toString().trim()) {
            const name = `${(measure || "").toString().trim()} ${ing.toString().trim()}`.trim();
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

            ingredientsList.push({
              name,
              available: isAvailable,
            });
          }
        }

        const instructionsRaw = (meal.strInstructions || "") as string;
        const preparation = instructionsRaw
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean);

        if (preparation.length === 0) {
          preparation.push(
            "Malzemeleri hazırlayın.",
            "Tarif talimatlarına göre pişirin.",
            "Servis edin.",
          );
        }

        const nutrition = await fetchNutritionFromUSDA(title);

        const pairing =
          "Bu yemeği yan ürünler ve içeceklerle damak zevkinize göre eşleştirebilirsiniz.";

        return {
          cuisine,
          title,
          ingredients: ingredientsList,
          preparation,
          nutrition,
          pairing,
          sourceUrl: meal.strSource || meal.strYoutube || null,
          image: meal.strMealThumb || null,
        };
      }),
    );

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

