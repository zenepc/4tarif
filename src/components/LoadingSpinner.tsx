import { ChefHat } from "lucide-react";

const LoadingSpinner = () => {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="relative">
        <div className="w-16 h-16 rounded-full border-4 border-muted animate-spin-slow">
          <div className="absolute top-0 left-1/2 w-2 h-2 -mt-1 -ml-1 rounded-full bg-primary" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <ChefHat className="w-7 h-7 text-primary animate-bounce-gentle" />
        </div>
      </div>
      <p className="mt-6 text-muted-foreground font-medium animate-pulse-gentle">
        pişiyor...
      </p>
    </div>
  );
};

export default LoadingSpinner;
