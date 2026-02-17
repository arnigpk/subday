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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const MAPBOX_TOKEN = Deno.env.get('MAPBOX_ACCESS_TOKEN');
    if (!MAPBOX_TOKEN) {
      console.error('MAPBOX_ACCESS_TOKEN not configured');
      return new Response(
        JSON.stringify({ error: 'Mapbox API token not configured' }),
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

    const validShops = shops.filter(s => s.lat && s.lng);
    
    if (validShops.length === 0) {
      return new Response(
        JSON.stringify({ distances: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mapbox Matrix API accepts max 25 coordinates per request
    // Format: coordinates as semicolon-separated lng,lat pairs
    const coordinates = [
      `${user_lng},${user_lat}`,
      ...validShops.map(s => `${s.lng},${s.lat}`),
    ].join(';');

    const destinations = validShops.map((_, i) => i + 1).join(';');
    
    const url = `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coordinates}?sources=0&destinations=${destinations}&annotations=distance,duration&access_token=${MAPBOX_TOKEN}`;

    console.log('Calling Mapbox Matrix API...');
    
    const response = await fetch(url);
    const data = await response.json();

    console.log('Mapbox response status:', response.status, 'code:', data.code);

    if (!response.ok || data.code !== 'Ok') {
      console.error('Mapbox API error:', data);
      return new Response(
        JSON.stringify({ 
          distances: calculateHaversineDistances(user_lat, user_lng, validShops),
          source: 'haversine'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse Mapbox response - distances[0] and durations[0] are arrays from source 0 to all destinations
    const distances: DistanceResult[] = [];
    
    if (data.distances && data.durations && data.distances[0] && data.durations[0]) {
      validShops.forEach((shop, index) => {
        distances.push({
          shop_id: shop.id,
          distance: data.distances[0][index] != null ? Math.round(data.distances[0][index]) : null,
          duration: data.durations[0][index] != null ? Math.round(data.durations[0][index]) : null,
        });
      });
    } else {
      return new Response(
        JSON.stringify({ 
          distances: calculateHaversineDistances(user_lat, user_lng, validShops),
          source: 'haversine'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Calculated ${distances.length} distances via Mapbox`);

    return new Response(
      JSON.stringify({ distances, source: 'mapbox' }),
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
  const R = 6371000;
  
  return shops.map(shop => {
    const dLat = toRad(shop.lat - userLat);
    const dLon = toRad(shop.lng - userLng);
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(userLat)) * Math.cos(toRad(shop.lat)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
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
