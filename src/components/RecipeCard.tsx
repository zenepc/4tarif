import { UtensilsCrossed, Flame, Wheat } from "lucide-react";

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

interface RecipeCardProps {
  recipe: Recipe;
  index: number;
}

const RecipeCard = ({ recipe, index }: RecipeCardProps) => {
  return (
    <div 
      className="recipe-card animate-fade-in-up"
      style={{ animationDelay: `${index * 0.1}s` }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <span className="inline-block px-3 py-1 text-xs font-medium rounded-full bg-secondary text-secondary-foreground mb-2">
            {recipe.cuisine}
          </span>
          <h3 className="font-display text-xl font-semibold text-foreground">
            {recipe.title}
          </h3>
        </div>
        <div className="p-2 rounded-lg bg-accent">
          <UtensilsCrossed className="w-5 h-5 text-accent-foreground" />
        </div>
      </div>

      {/* Ingredients */}
      <div className="mb-4">
        <ul className="space-y-1">
          {recipe.ingredients.map((ingredient, i) => (
            <li key={i} className="text-sm text-foreground flex items-start gap-2">
              <span className={`font-bold shrink-0 ${ingredient.available ? 'text-green-600' : 'text-muted-foreground'}`}>
                {ingredient.available ? '+' : '-'}
              </span>
              {ingredient.name}
            </li>
          ))}
        </ul>
      </div>

      {/* Preparation */}
      <div className="mb-4">
        <ol className="space-y-2">
          {recipe.preparation.map((step, i) => (
            <li key={i} className="text-sm text-foreground flex gap-3">
              <span className="font-medium text-primary shrink-0">{i + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Pairing Suggestion */}
      {recipe.pairing && (
        <div className="mb-4 p-3 rounded-lg bg-accent/50">
          <p className="text-sm text-foreground">
            <span className="font-medium">🍷 Öneri:</span> {recipe.pairing}
          </p>
        </div>
      )}

      {/* Nutrition */}
      <div className="pt-4 border-t border-border">
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-secondary">
              <Flame className="w-3.5 h-3.5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Protein</p>
              <p className="text-sm font-medium text-foreground">{recipe.nutrition.protein}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-secondary">
              <Wheat className="w-3.5 h-3.5 text-kitchen-orange" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Karbonhidrat</p>
              <p className="text-sm font-medium text-foreground">{recipe.nutrition.carbohydrate}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-secondary">
              <span className="text-xs">🥑</span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Yağ</p>
              <p className="text-sm font-medium text-foreground">{recipe.nutrition.fat}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecipeCard;
