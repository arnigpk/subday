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
  distance: number | null;
  duration: number | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let body: { user_lat: number; user_lng: number; shops: ShopCoord[] };

  try {
    body = await req.json();
  } catch (e) {
    // Request body was aborted/truncated — return empty gracefully
    console.log('Request body read failed (likely aborted):', e.message);
    return new Response(
      JSON.stringify({ distances: [], source: 'aborted' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const MAPBOX_TOKEN = Deno.env.get('MAPBOX_ACCESS_TOKEN');
    if (!MAPBOX_TOKEN) {
      return new Response(
        JSON.stringify({ error: 'Mapbox API token not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { user_lat, user_lng, shops } = body;

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

    const needsDummy = validShops.length === 1;
    const shopCoords = needsDummy ? [...validShops, validShops[0]] : validShops;

    const coordinates = [
      `${user_lng},${user_lat}`,
      ...shopCoords.map(s => `${s.lng},${s.lat}`),
    ].join(';');

    const destinations = shopCoords.map((_, i) => String(i + 1)).join(';');
    const url = `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coordinates}?sources=0&destinations=${destinations}&annotations=distance,duration&access_token=${MAPBOX_TOKEN}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || data.code !== 'Ok') {
      console.error('Mapbox API error:', data.code);
      return new Response(
        JSON.stringify({ error: 'Mapbox API error' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const distances: DistanceResult[] = [];
    if (data.distances?.[0] && data.durations?.[0]) {
      validShops.forEach((shop, index) => {
        distances.push({
          shop_id: shop.id,
          distance: data.distances[0][index] != null ? Math.round(data.distances[0][index]) : null,
          duration: data.durations[0][index] != null ? Math.round(data.durations[0][index]) : null,
        });
      });
    }

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