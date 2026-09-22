export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      administradora: {
        Row: {
          cnpj: string | null
          criado_em: string
          id: string
          nome: string
          situacao: string
        }
        Insert: {
          cnpj?: string | null
          criado_em?: string
          id?: string
          nome: string
          situacao?: string
        }
        Update: {
          cnpj?: string | null
          criado_em?: string
          id?: string
          nome?: string
          situacao?: string
        }
        Relationships: []
      }
      auditoria_evento: {
        Row: {
          acao: string
          autor_id: string | null
          criado_em: string
          dados_anteriores: Json | null
          dados_novos: Json | null
          id: string
          registro_id: string
          tabela: string
        }
        Insert: {
          acao: string
          autor_id?: string | null
          criado_em?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          id?: string
          registro_id: string
          tabela: string
        }
        Update: {
          acao?: string
          autor_id?: string | null
          criado_em?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          id?: string
          registro_id?: string
          tabela?: string
        }
        Relationships: []
      }
      campanha_incentivo: {
        Row: {
          administradora_id: string
          bonus_percentual: number
          criado_em: string
          id: string
          nome: string
          vigencia_fim: string | null
          vigencia_inicio: string
        }
        Insert: {
          administradora_id: string
          bonus_percentual?: number
          criado_em?: string
          id?: string
          nome: string
          vigencia_fim?: string | null
          vigencia_inicio: string
        }
        Update: {
          administradora_id?: string
          bonus_percentual?: number
          criado_em?: string
          id?: string
          nome?: string
          vigencia_fim?: string | null
          vigencia_inicio?: string
        }
        Relationships: [
          {
            foreignKeyName: "campanha_incentivo_administradora_id_fkey"
            columns: ["administradora_id"]
            isOneToOne: false
            referencedRelation: "administradora"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato: {
        Row: {
          criado_em: string
          id: string
          marca_id: number
          oportunidade_id: string
          proposta_id: string
          status: string
          vigencia_fim: string | null
          vigencia_inicio: string
        }
        Insert: {
          criado_em?: string
          id?: string
          marca_id: number
          oportunidade_id: string
          proposta_id: string
          status?: string
          vigencia_fim?: string | null
          vigencia_inicio?: string
        }
        Update: {
          criado_em?: string
          id?: string
          marca_id?: number
          oportunidade_id?: string
          proposta_id?: string
          status?: string
          vigencia_fim?: string | null
          vigencia_inicio?: string
        }
        Relationships: [
          {
            foreignKeyName: "contrato_marca_id_fkey"
            columns: ["marca_id"]
            isOneToOne: false
            referencedRelation: "marca"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "oportunidade"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_proposta_id_fkey"
            columns: ["proposta_id"]
            isOneToOne: true
            referencedRelation: "proposta"
            referencedColumns: ["id"]
          },
        ]
      }
      marca: {
        Row: {
          codigo: string
          id: number
          nome: string
        }
        Insert: {
          codigo: string
          id: number
          nome: string
        }
        Update: {
          codigo?: string
          id?: number
          nome?: string
        }
        Relationships: []
      }
      oferta_administradora: {
        Row: {
          administradora_id: string
          campanha_id: string | null
          comissao_percentual: number
          criado_em: string
          criado_por: string | null
          estado: string
          fonte: string
          id: string
          plano_id: string
          texto_origem: string | null
          validado_em: string | null
          validado_por: string | null
          vigencia_fim: string | null
          vigencia_inicio: string
        }
        Insert: {
          administradora_id: string
          campanha_id?: string | null
          comissao_percentual: number
          criado_em?: string
          criado_por?: string | null
          estado?: string
          fonte: string
          id?: string
          plano_id: string
          texto_origem?: string | null
          validado_em?: string | null
          validado_por?: string | null
          vigencia_fim?: string | null
          vigencia_inicio?: string
        }
        Update: {
          administradora_id?: string
          campanha_id?: string | null
          comissao_percentual?: number
          criado_em?: string
          criado_por?: string | null
          estado?: string
          fonte?: string
          id?: string
          plano_id?: string
          texto_origem?: string | null
          validado_em?: string | null
          validado_por?: string | null
          vigencia_fim?: string | null
          vigencia_inicio?: string
        }
        Relationships: [
          {
            foreignKeyName: "oferta_administradora_administradora_id_fkey"
            columns: ["administradora_id"]
            isOneToOne: false
            referencedRelation: "administradora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oferta_administradora_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanha_incentivo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oferta_administradora_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "usuario_interno"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oferta_administradora_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "plano_consorcio_administradora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oferta_administradora_validado_por_fkey"
            columns: ["validado_por"]
            isOneToOne: false
            referencedRelation: "usuario_interno"
            referencedColumns: ["id"]
          },
        ]
      }
      oportunidade: {
        Row: {
          atualizado_em: string
          criado_em: string
          etapa: string
          id: string
          marca_id: number
          origem: string | null
          pessoa_fisica_id: string | null
          pessoa_juridica_id: string | null
          probabilidade: number | null
          produto: string
          responsavel_id: string | null
          status: string
          valor_previsto: number | null
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          etapa?: string
          id?: string
          marca_id: number
          origem?: string | null
          pessoa_fisica_id?: string | null
          pessoa_juridica_id?: string | null
          probabilidade?: number | null
          produto: string
          responsavel_id?: string | null
          status?: string
          valor_previsto?: number | null
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          etapa?: string
          id?: string
          marca_id?: number
          origem?: string | null
          pessoa_fisica_id?: string | null
          pessoa_juridica_id?: string | null
          probabilidade?: number | null
          produto?: string
          responsavel_id?: string | null
          status?: string
          valor_previsto?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "oportunidade_marca_id_fkey"
            columns: ["marca_id"]
            isOneToOne: false
            referencedRelation: "marca"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidade_pessoa_fisica_id_fkey"
            columns: ["pessoa_fisica_id"]
            isOneToOne: false
            referencedRelation: "pessoa_fisica"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidade_pessoa_juridica_id_fkey"
            columns: ["pessoa_juridica_id"]
            isOneToOne: false
            referencedRelation: "pessoa_juridica"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidade_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "usuario_interno"
            referencedColumns: ["id"]
          },
        ]
      }
      papel: {
        Row: {
          codigo: string
          descricao: string
          id: number
        }
        Insert: {
          codigo: string
          descricao: string
          id?: never
        }
        Update: {
          codigo?: string
          descricao?: string
          id?: never
        }
        Relationships: []
      }
      pessoa_fisica: {
        Row: {
          atualizado_em: string
          cpf: string | null
          criado_em: string
          data_nascimento: string | null
          email: string | null
          id: string
          marca_entrada_id: number
          mcj_id: string
          nome_completo: string
          origem_primeiro_contato: string | null
          telefone_whatsapp: string | null
        }
        Insert: {
          atualizado_em?: string
          cpf?: string | null
          criado_em?: string
          data_nascimento?: string | null
          email?: string | null
          id?: string
          marca_entrada_id: number
          mcj_id?: string
          nome_completo: string
          origem_primeiro_contato?: string | null
          telefone_whatsapp?: string | null
        }
        Update: {
          atualizado_em?: string
          cpf?: string | null
          criado_em?: string
          data_nascimento?: string | null
          email?: string | null
          id?: string
          marca_entrada_id?: number
          mcj_id?: string
          nome_completo?: string
          origem_primeiro_contato?: string | null
          telefone_whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pessoa_fisica_marca_entrada_id_fkey"
            columns: ["marca_entrada_id"]
            isOneToOne: false
            referencedRelation: "marca"
            referencedColumns: ["id"]
          },
        ]
      }
      pessoa_juridica: {
        Row: {
          atualizado_em: string
          cnpj: string | null
          criado_em: string
          id: string
          marca_entrada_id: number
          mcj_id: string
          nome_fantasia: string | null
          origem_primeiro_contato: string | null
          razao_social: string
        }
        Insert: {
          atualizado_em?: string
          cnpj?: string | null
          criado_em?: string
          id?: string
          marca_entrada_id: number
          mcj_id?: string
          nome_fantasia?: string | null
          origem_primeiro_contato?: string | null
          razao_social: string
        }
        Update: {
          atualizado_em?: string
          cnpj?: string | null
          criado_em?: string
          id?: string
          marca_entrada_id?: number
          mcj_id?: string
          nome_fantasia?: string | null
          origem_primeiro_contato?: string | null
          razao_social?: string
        }
        Relationships: [
          {
            foreignKeyName: "pessoa_juridica_marca_entrada_id_fkey"
            columns: ["marca_entrada_id"]
            isOneToOne: false
            referencedRelation: "marca"
            referencedColumns: ["id"]
          },
        ]
      }
      plano_consorcio_administradora: {
        Row: {
          administradora_id: string
          credito_max: number
          credito_min: number
          criado_em: string
          id: string
          nome_plano: string
          prazo_meses: number
          taxa_administracao_percentual: number
        }
        Insert: {
          administradora_id: string
          credito_max: number
          credito_min: number
          criado_em?: string
          id?: string
          nome_plano: string
          prazo_meses: number
          taxa_administracao_percentual: number
        }
        Update: {
          administradora_id?: string
          credito_max?: number
          credito_min?: number
          criado_em?: string
          id?: string
          nome_plano?: string
          prazo_meses?: number
          taxa_administracao_percentual?: number
        }
        Relationships: [
          {
            foreignKeyName: "plano_consorcio_administradora_administradora_id_fkey"
            columns: ["administradora_id"]
            isOneToOne: false
            referencedRelation: "administradora"
            referencedColumns: ["id"]
          },
        ]
      }
      politica_recomendacao_consorcio: {
        Row: {
          criado_em: string
          id: string
          peso_adequacao: number
          peso_resultado_comercial: number
          vigente: boolean
        }
        Insert: {
          criado_em?: string
          id?: string
          peso_adequacao: number
          peso_resultado_comercial: number
          vigente?: boolean
        }
        Update: {
          criado_em?: string
          id?: string
          peso_adequacao?: number
          peso_resultado_comercial?: number
          vigente?: boolean
        }
        Relationships: []
      }
      proposta: {
        Row: {
          criado_em: string
          id: string
          marca_id: number
          oportunidade_id: string
          responsavel_id: string | null
          status: string
          validade: string | null
          versao: number
        }
        Insert: {
          criado_em?: string
          id?: string
          marca_id: number
          oportunidade_id: string
          responsavel_id?: string | null
          status?: string
          validade?: string | null
          versao: number
        }
        Update: {
          criado_em?: string
          id?: string
          marca_id?: number
          oportunidade_id?: string
          responsavel_id?: string | null
          status?: string
          validade?: string | null
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposta_marca_id_fkey"
            columns: ["marca_id"]
            isOneToOne: false
            referencedRelation: "marca"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposta_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "oportunidade"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposta_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "usuario_interno"
            referencedColumns: ["id"]
          },
        ]
      }
      proposta_item: {
        Row: {
          criado_em: string
          descricao: string
          id: string
          preco_total: number | null
          preco_unitario: number
          proposta_id: string
          quantidade: number
        }
        Insert: {
          criado_em?: string
          descricao: string
          id?: string
          preco_total?: number | null
          preco_unitario: number
          proposta_id: string
          quantidade?: number
        }
        Update: {
          criado_em?: string
          descricao?: string
          id?: string
          preco_total?: number | null
          preco_unitario?: number
          proposta_id?: string
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposta_item_proposta_id_fkey"
            columns: ["proposta_id"]
            isOneToOne: false
            referencedRelation: "proposta"
            referencedColumns: ["id"]
          },
        ]
      }
      usuario_interno: {
        Row: {
          ativo: boolean
          criado_em: string
          id: string
          marca_id: number
          nome: string
          papel_id: number
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          id: string
          marca_id: number
          nome: string
          papel_id: number
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          id?: string
          marca_id?: number
          nome?: string
          papel_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "usuario_interno_marca_id_fkey"
            columns: ["marca_id"]
            isOneToOne: false
            referencedRelation: "marca"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuario_interno_papel_id_fkey"
            columns: ["papel_id"]
            isOneToOne: false
            referencedRelation: "papel"
            referencedColumns: ["id"]
          },
        ]
      }
      vinculo_pf_pj: {
        Row: {
          criado_em: string
          id: string
          papel: string
          pessoa_fisica_id: string
          pessoa_juridica_id: string
          vigente: boolean
        }
        Insert: {
          criado_em?: string
          id?: string
          papel: string
          pessoa_fisica_id: string
          pessoa_juridica_id: string
          vigente?: boolean
        }
        Update: {
          criado_em?: string
          id?: string
          papel?: string
          pessoa_fisica_id?: string
          pessoa_juridica_id?: string
          vigente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "vinculo_pf_pj_pessoa_fisica_id_fkey"
            columns: ["pessoa_fisica_id"]
            isOneToOne: false
            referencedRelation: "pessoa_fisica"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculo_pf_pj_pessoa_juridica_id_fkey"
            columns: ["pessoa_juridica_id"]
            isOneToOne: false
            referencedRelation: "pessoa_juridica"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      jwt_marca: { Args: never; Returns: string }
      jwt_papel: { Args: never; Returns: string }
      next_mcj_id: { Args: { prefixo: string }; Returns: string }
      tem_acesso_marca: { Args: { p_marca_id: number }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

