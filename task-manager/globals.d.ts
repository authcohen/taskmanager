// Type declarations for missing modules
declare module '@supabase/supabase-js' {
  export interface SupabaseClient {
    from: (table: string) => SupabaseQueryBuilder;
  }
  
  export interface SupabaseQueryBuilder {
    select: (columns?: string) => SupabaseQueryBuilder;
    insert: (data: any[]) => SupabaseQueryBuilder;
    update: (data: any) => SupabaseQueryBuilder;
    delete: () => SupabaseQueryBuilder;
    eq: (column: string, value: any) => SupabaseQueryBuilder;
    in: (column: string, values: any[]) => SupabaseQueryBuilder;
    single: () => Promise<{ data: any; error: any }>;
    limit: (count: number) => SupabaseQueryBuilder;
  }
  
  export function createClient(url: string, key: string): SupabaseClient;
}

// Global namespace for Node.js process
declare namespace NodeJS {
  interface ProcessEnv {
    SUPABASE_URL: string;
    SUPABASE_SERVICE_KEY: string;
    NEXT_PUBLIC_SUPABASE_URL: string;
    NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
  }
}

declare var process: {
  env: {
    SUPABASE_URL: string;
    SUPABASE_SERVICE_KEY: string;
    NEXT_PUBLIC_SUPABASE_URL: string;
    NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
    [key: string]: string;
  }
};

// Type declarations for Lucide React
declare module 'lucide-react' {
  import { FC, SVGProps } from 'react';
  
  export interface IconProps extends SVGProps<SVGSVGElement> {
    size?: number | string;
    color?: string;
  }
  
  export const Check: FC<IconProps>;
  export const Trash: FC<IconProps>;
  export const Plus: FC<IconProps>;
  export const LogOut: FC<IconProps>;
  export const LogIn: FC<IconProps>;
  export const UserIcon: FC<IconProps>;
  export const Users: FC<IconProps>;
  export const ClipboardList: FC<IconProps>;
  export const CalendarClock: FC<IconProps>;
}

// Type declarations for date-fns
declare module 'date-fns' {
  export function format(date: Date | number, formatStr: string): string;
}

// React module declaration
declare module 'react' {
  interface HTMLAttributes<T> extends AriaAttributes, DOMAttributes<T> {
    class?: string;
    className?: string;
    [key: string]: any;
  }

  interface KeyboardEvent {
    key: string;
  }
  
  interface ChangeEvent<T = Element> {
    target: T & {
      value: string;
    };
  }
  
  export interface FC<P = {}> {
    (props: P): JSX.Element | null;
  }
}

// Global JSX namespace
declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
  
  interface Element {}
} 