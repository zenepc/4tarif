import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ingredients } = await req.json();
    
    if (!ingredients || typeof ingredients !== "string" || ingredients.trim() === "") {
      return new Response(
        JSON.stringify({ error: "Lütfen malzeme listesi girin" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const EDAMAM_APP_ID = Deno.env.get("EDAMAM_APP_ID");
    const EDAMAM_APP_KEY = Deno.env.get("EDAMAM_APP_KEY");
    
    if (!EDAMAM_APP_ID || !EDAMAM_APP_KEY) {
      console.error("Edamam API credentials are not configured");
      throw new Error("API servisi yapılandırılmamış");
    }

    const userIngredientsList = ingredients.toLowerCase().split(/[,\n]+/).map((i: string) => i.trim()).filter((i: string) => i);
    
    // Edamam API'ye malzemeleri query string olarak gönder
    const ingredientsQuery = userIngredientsList.join(",");
    
    console.log("Calling Edamam API with ingredients:", ingredientsQuery);

    // Edamam Recipe Search API çağrısı
    const edamamUrl = new URL("https://api.edamam.com/api/recipes/v2");
    edamamUrl.searchParams.append("type", "public");
    edamamUrl.searchParams.append("q", ingredientsQuery);
    edamamUrl.searchParams.append("app_id", EDAMAM_APP_ID);
    edamamUrl.searchParams.append("app_key", EDAMAM_APP_KEY);
    edamamUrl.searchParams.append("to", "20"); // En fazla 20 tarif getir

    const response = await fetch(edamamUrl.toString());

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Edamam API error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Çok fazla istek gönderildi. Lütfen biraz bekleyin." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (response.status === 401) {
        return new Response(
          JSON.stringify({ error: "API anahtarı geçersiz. Lütfen yapılandırmayı kontrol edin." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      throw new Error("API servis hatası");
    }

    const data = await response.json();
    
    if (!data.hits || !Array.isArray(data.hits) || data.hits.length === 0) {
      return new Response(
        JSON.stringify({ error: "Bu malzemelerle tarif bulunamadı. Farklı malzemeler deneyin." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Edamam'dan gelen tarifleri uygulamamızın formatına dönüştür
    const recipes = data.hits
      .slice(0, 4) // İlk 4 tarifi al
      .map((hit: any) => {
        const recipe = hit.recipe;
        
        // Mutfak türünü belirle (cuisine bilgisi varsa kullan, yoksa genel)
        const cuisine = recipe.cuisineType?.[0] 
          ? recipe.cuisineType[0].charAt(0).toUpperCase() + recipe.cuisineType[0].slice(1) + " Mutfağı"
          : recipe.mealType?.[0] 
            ? recipe.mealType[0].charAt(0).toUpperCase() + recipe.mealType[0].slice(1)
            : "Dünya Mutfağı";

        // Kullanıcının malzemelerini işaretle
        const userIngredientsLower = userIngredientsList.map(i => i.toLowerCase());
        const ingredientLines = Array.isArray(recipe.ingredientLines) ? recipe.ingredientLines : [];
        const ingredients = ingredientLines.map((ing: string) => {
          const ingLower = ing.toLowerCase();
          const ingWords = ingLower.split(/[^a-z0-9ığüşöçİĞÜŞÖÇ]+/i).filter(Boolean);
          // Daha kesin eşleşme: kelime bazlı kontrol (substring hatalarını engellemek için)
          const isAvailable = userIngredientsLower.some(userIng => {
            const userWords = userIng.split(/\s+/).filter(Boolean);
            return userWords.every(word => 
              ingWords.includes(word) || ingWords.some(w => w.startsWith(word))
            );
          });
          return {
            name: ing,
            available: isAvailable
          };
        });

        // Hazırlama adımlarını oluştur (Edamam'da direkt yoksa, tarif linkinden veya genel adımlardan oluştur)
        const preparation = ingredientLines.length > 0
          ? [
              "Malzemeleri hazırlayın.",
              "Tarif talimatlarına göre pişirin.",
              "Servis edin."
            ]
          : ["Tarif talimatlarına göre hazırlayın."];

        // Beslenme bilgilerini formatla
        const nutrition = {
          protein: recipe.totalNutrients?.PROCNT?.quantity 
            ? `${Math.round(recipe.totalNutrients.PROCNT.quantity)}g`
            : "N/A",
          carbohydrate: recipe.totalNutrients?.CHOCDF?.quantity 
            ? `${Math.round(recipe.totalNutrients.CHOCDF.quantity)}g`
            : "N/A",
          fat: recipe.totalNutrients?.FAT?.quantity 
            ? `${Math.round(recipe.totalNutrients.FAT.quantity)}g`
            : "N/A",
        };

        return {
          cuisine: cuisine,
          title: recipe.label || "Tarif",
          ingredients: ingredients,
          preparation: preparation,
          nutrition: nutrition,
          pairing: recipe.dishType?.[0] 
            ? `Bu yemeğin yanında ${recipe.dishType[0]} için uygun içecekler iyi gider.`
            : "Bu yemeğin yanında uygun içecekler iyi gider.",
          sourceUrl: recipe.url, // Opsiyonel: Orijinal tarif linki
          image: recipe.image // Opsiyonel: Tarif görseli
        };
      });

    console.log("Returning recipes:", recipes.length);

    return new Response(
      JSON.stringify({ recipes: recipes }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in generate-recipes:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Bir hata oluştu" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});