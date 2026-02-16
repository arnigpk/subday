import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ShopCoord {
  id: string;
  lat: number;
  lng: number;
}

interface DistanceResult {
  shop_id: string;
  distance: number | null; // meters
  duration: number | null; // seconds
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const DGIS_API_KEY = Deno.env.get('DGIS_API_KEY');
    if (!DGIS_API_KEY) {
      console.error('DGIS_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: '2GIS API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { user_lat, user_lng, shops } = await req.json() as {
      user_lat: number;
      user_lng: number;
      shops: ShopCoord[];
    };

    console.log(`Calculating distances from user (${user_lat}, ${user_lng}) to ${shops.length} shops`);

    if (!user_lat || !user_lng || !shops || shops.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Filter shops with valid coordinates
    const validShops = shops.filter(s => s.lat && s.lng);
    
    if (validShops.length === 0) {
      return new Response(
        JSON.stringify({ distances: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2GIS Distance Matrix API (POST method required)
    // Format: sources and targets as arrays of {lat, lng} objects
    const url = `https://routing.api.2gis.com/get_dist_matrix?key=${DGIS_API_KEY}&version=2.0`;
    
    const body = {
      points: [
        { lat: user_lat, lon: user_lng },
        ...validShops.map(s => ({ lat: s.lat, lon: s.lng })),
      ],
      sources: [0],
      targets: validShops.map((_, i) => i + 1),
      mode: "driving",
    };

    console.log('Calling 2GIS API (POST)...');
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();

    console.log('2GIS response status:', response.status);

    if (!response.ok || data.error) {
      console.error('2GIS API error:', data);
      // Fall back to Haversine formula
      return new Response(
        JSON.stringify({ 
          distances: calculateHaversineDistances(user_lat, user_lng, validShops),
          source: 'haversine'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse 2GIS response
    const distances: DistanceResult[] = [];
    
    if (data.routes && Array.isArray(data.routes)) {
      validShops.forEach((shop, index) => {
        const route = data.routes[index];
        distances.push({
          shop_id: shop.id,
          distance: route?.distance ?? null,
          duration: route?.duration ?? null,
        });
      });
    } else {
      // Fallback to haversine if response format is unexpected
      return new Response(
        JSON.stringify({ 
          distances: calculateHaversineDistances(user_lat, user_lng, validShops),
          source: 'haversine'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Calculated ${distances.length} distances`);

    return new Response(
      JSON.stringify({ distances, source: '2gis' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error calculating distances:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Haversine formula fallback
function calculateHaversineDistances(userLat: number, userLng: number, shops: ShopCoord[]): DistanceResult[] {
  const R = 6371000; // Earth radius in meters
  
  return shops.map(shop => {
    const dLat = toRad(shop.lat - userLat);
    const dLon = toRad(shop.lng - userLng);
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(userLat)) * Math.cos(toRad(shop.lat)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    
    // Estimate duration: ~50 km/h average city speed
    const duration = (distance / 1000) / 50 * 3600;
    
    return {
      shop_id: shop.id,
      distance: Math.round(distance),
      duration: Math.round(duration),
    };
  });
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}
