import { useState } from "react";
import { ChefHat, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import RecipeCard from "@/components/RecipeCard";
import LoadingSpinner from "@/components/LoadingSpinner";

interface RecipeIngredient {
  name: string;
  available: boolean;
}

interface Recipe {
  cuisine: string;
  title: string;
  ingredients: RecipeIngredient[];
  preparation: string[];
  nutrition: {
    protein: string;
    carbohydrate: string;
    fat: string;
  };
  pairing?: string;
}

const Index = () => {
  const [ingredients, setIngredients] = useState("");
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (!ingredients.trim()) {
      toast.error("Lütfen malzeme listesi girin");
      return;
    }

    setIsLoading(true);
    setRecipes([]);

    try {
      const response = await fetch("/api/generate-recipes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ingredients: ingredients.trim() }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const message =
          errorData?.error ||
          (response.status === 429
            ? "Çok fazla istek gönderildi. Lütfen biraz bekleyin."
            : "Tarif oluşturulurken bir hata oluştu");
        throw new Error(message);
      }

      const data = await response.json();

      if (data?.recipes && Array.isArray(data.recipes)) {
        setRecipes(data.recipes);
        toast.success(`${data.recipes.length} tarif bulundu!`);
      } else {
        throw new Error("Geçersiz yanıt formatı");
      }
    } catch (error) {
      console.error("Error:", error);
      toast.error(error instanceof Error ? error.message : "Tarif oluşturulurken bir hata oluştu");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-accent/50 via-background to-secondary/30" />
        <div className="relative container max-w-4xl mx-auto px-4 pt-12 pb-8 md:pt-20 md:pb-12">
          {/* Logo and Title */}
          <div className="text-center mb-8 md:mb-12">
            <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-primary/10 mb-6">
              <ChefHat className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground">
              4tarif
            </h1>
          </div>

          {/* Input Section */}
          <div className="max-w-2xl mx-auto">
            <div className="bg-card rounded-2xl p-6 shadow-lg border border-border/50">
              <Textarea
                id="ingredients"
                placeholder="domates, soğan, biber, yumurta, peynir..."
                value={ingredients}
                onChange={(e) => setIngredients(e.target.value)}
                className="min-h-[120px] resize-none text-base bg-background border-border focus:ring-primary mb-4"
                disabled={isLoading}
              />
              <Button
                onClick={handleSubmit}
                disabled={isLoading || !ingredients.trim()}
                className="w-full h-12 text-base font-medium bg-primary hover:bg-primary/90 text-primary-foreground transition-all duration-200 hover:shadow-lg"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin">⏳</span>
                    Hazırlanıyor...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5" />
                    pişir
                  </span>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Results Section */}
      <div className="container max-w-6xl mx-auto px-4 py-8 md:py-12">
        {isLoading && <LoadingSpinner />}

        {!isLoading && recipes.length > 0 && (
          <div className="grid gap-6 md:grid-cols-2">
            {recipes.map((recipe, index) => (
              <RecipeCard key={index} recipe={recipe} index={index} />
            ))}
          </div>
        )}

        {!isLoading && recipes.length === 0 && (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <ChefHat className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">
              Malzemelerini yaz ve{" "}
              <span className="font-medium text-primary">pişir</span> butonuna tıkla
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-border py-6 mt-8">
        <div className="container text-center">
          <p className="text-sm text-muted-foreground">
            4tarif
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
