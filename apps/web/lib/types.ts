export type Database = {
  public: {
    Tables: {
      saved_searches: {
        Row: {
          id: string;
          user_id: string;
          make: string;
          model: string;
          trim: string | null;
          year_min: number;
          year_max: number;
          zip_code: string;
          search_radius: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          make: string;
          model: string;
          trim?: string | null;
          year_min: number;
          year_max: number;
          zip_code: string;
          search_radius?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          make?: string;
          model?: string;
          trim?: string | null;
          year_min?: number;
          year_max?: number;
          zip_code?: string;
          search_radius?: number;
          is_active?: boolean;
          updated_at?: string;
        };
      };
      vehicles: {
        Row: {
          id: string;
          vin: string;
          make: string | null;
          model: string | null;
          trim: string | null;
          year: number | null;
          exterior_color: string | null;
          interior_color: string | null;
          mileage: number | null;
          transmission: string | null;
          drivetrain: string | null;
          engine: string | null;
          vin_data: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          vin: string;
          make?: string | null;
          model?: string | null;
          trim?: string | null;
          year?: number | null;
          exterior_color?: string | null;
          interior_color?: string | null;
          mileage?: number | null;
          transmission?: string | null;
          drivetrain?: string | null;
          engine?: string | null;
          vin_data?: Record<string, unknown> | null;
          created_at?: string;
        };
        Update: {
          vin?: string;
          make?: string | null;
          model?: string | null;
          trim?: string | null;
          year?: number | null;
          exterior_color?: string | null;
          interior_color?: string | null;
          mileage?: number | null;
          transmission?: string | null;
          drivetrain?: string | null;
          engine?: string | null;
          vin_data?: Record<string, unknown> | null;
        };
      };
      listings: {
        Row: {
          id: string;
          vehicle_id: string;
          search_id: string;
          source_site: 'autotrader' | 'bat' | 'carsandbids';
          url: string;
          current_price: number | null;
          sale_price: number | null;
          geography: string | null;
          distance_mi: number | null;
          image_url: string | null;
          status: 'active' | 'cross_listed' | 'sold' | 'delisted';
          first_seen: string;
          last_seen: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          vehicle_id: string;
          search_id: string;
          source_site: 'autotrader' | 'bat' | 'carsandbids';
          url: string;
          current_price?: number | null;
          sale_price?: number | null;
          geography?: string | null;
          distance_mi?: number | null;
          image_url?: string | null;
          status?: 'active' | 'cross_listed' | 'sold' | 'delisted';
          first_seen?: string;
          last_seen?: string;
          created_at?: string;
        };
        Update: {
          vehicle_id?: string;
          search_id?: string;
          source_site?: 'autotrader' | 'bat' | 'carsandbids';
          url?: string;
          current_price?: number | null;
          sale_price?: number | null;
          geography?: string | null;
          distance_mi?: number | null;
          image_url?: string | null;
          status?: 'active' | 'cross_listed' | 'sold' | 'delisted';
          last_seen?: string;
        };
      };
      price_history: {
        Row: {
          id: string;
          listing_id: string;
          price: number;
          recorded_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          price: number;
          recorded_at?: string;
        };
        Update: {
          listing_id?: string;
          price?: number;
          recorded_at?: string;
        };
      };
      user_vehicle_prefs: {
        Row: {
          id: string;
          user_id: string;
          listing_id: string;
          is_hidden: boolean;
          is_favorited: boolean;
        };
        Insert: {
          id?: string;
          user_id: string;
          listing_id: string;
          is_hidden?: boolean;
          is_favorited?: boolean;
        };
        Update: {
          is_hidden?: boolean;
          is_favorited?: boolean;
        };
      };
      notification_settings: {
        Row: {
          id: string;
          user_id: string;
          search_id: string;
          price_drop_enabled: boolean;
          price_drop_pct: number;
          new_listing_enabled: boolean;
          sold_alert_enabled: boolean;
          email: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          search_id: string;
          price_drop_enabled?: boolean;
          price_drop_pct?: number;
          new_listing_enabled?: boolean;
          sold_alert_enabled?: boolean;
          email?: string | null;
        };
        Update: {
          price_drop_enabled?: boolean;
          price_drop_pct?: number;
          new_listing_enabled?: boolean;
          sold_alert_enabled?: boolean;
          email?: string | null;
        };
      };
      scrape_log: {
        Row: {
          id: string;
          search_id: string;
          source_site: string;
          status: string;
          listings_found: number;
          error_message: string | null;
          duration_ms: number | null;
          scraped_at: string;
        };
        Insert: {
          id?: string;
          search_id: string;
          source_site: string;
          status: string;
          listings_found?: number;
          error_message?: string | null;
          duration_ms?: number | null;
          scraped_at?: string;
        };
        Update: {
          status?: string;
          listings_found?: number;
          error_message?: string | null;
          duration_ms?: number | null;
        };
      };
    };
  };
};

export type SavedSearch = Database['public']['Tables']['saved_searches']['Row'];
export type Vehicle = Database['public']['Tables']['vehicles']['Row'];
export type Listing = Database['public']['Tables']['listings']['Row'];
export type PriceHistory = Database['public']['Tables']['price_history']['Row'];
export type UserVehiclePref = Database['public']['Tables']['user_vehicle_prefs']['Row'];
export type NotificationSetting = Database['public']['Tables']['notification_settings']['Row'];
export type ScrapeLog = Database['public']['Tables']['scrape_log']['Row'];

export type ListingWithVehicle = Listing & {
  vehicles: Vehicle;
  user_vehicle_prefs?: UserVehiclePref[];
};
