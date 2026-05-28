/**
 * Geographic reference data for the registration form.
 *
 * Structure:
 *   COUNTRIES          — ISO alpha-2 list, focused on energy markets
 *   STATES_BY_COUNTRY  — keyed by country code; empty = no state-level subdivision shown
 *   CITIES_BY_STATE    — keyed by "CC-ST" (e.g. "BR-SP")
 *   CITIES_BY_COUNTRY  — keyed by country code; used when the country has no state data
 */

export type GeoCountry = { code: string; name: string };
export type GeoState   = { code: string; name: string };

// ─── Countries ────────────────────────────────────────────────────────────────

export const COUNTRIES: GeoCountry[] = [
  { code: "BR", name: "Brazil" },
  { code: "AR", name: "Argentina" },
  { code: "BO", name: "Bolivia" },
  { code: "CL", name: "Chile" },
  { code: "CO", name: "Colombia" },
  { code: "EC", name: "Ecuador" },
  { code: "PY", name: "Paraguay" },
  { code: "PE", name: "Peru" },
  { code: "UY", name: "Uruguay" },
  { code: "VE", name: "Venezuela" },
  { code: "MX", name: "Mexico" },
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "DE", name: "Germany" },
  { code: "ES", name: "Spain" },
  { code: "FR", name: "France" },
  { code: "GB", name: "United Kingdom" },
  { code: "IT", name: "Italy" },
  { code: "NL", name: "Netherlands" },
  { code: "PT", name: "Portugal" },
  { code: "AU", name: "Australia" },
  { code: "CN", name: "China" },
  { code: "IN", name: "India" },
  { code: "JP", name: "Japan" },
  { code: "NG", name: "Nigeria" },
  { code: "ZA", name: "South Africa" },
];

// ─── States / Provinces by country ───────────────────────────────────────────

export const STATES_BY_COUNTRY: Record<string, GeoState[]> = {

  // ── Brazil — all 27 federative units ──────────────────────────────────────
  BR: [
    { code: "AC", name: "Acre" },
    { code: "AL", name: "Alagoas" },
    { code: "AP", name: "Amapá" },
    { code: "AM", name: "Amazonas" },
    { code: "BA", name: "Bahia" },
    { code: "CE", name: "Ceará" },
    { code: "DF", name: "Distrito Federal" },
    { code: "ES", name: "Espírito Santo" },
    { code: "GO", name: "Goiás" },
    { code: "MA", name: "Maranhão" },
    { code: "MT", name: "Mato Grosso" },
    { code: "MS", name: "Mato Grosso do Sul" },
    { code: "MG", name: "Minas Gerais" },
    { code: "PA", name: "Pará" },
    { code: "PB", name: "Paraíba" },
    { code: "PR", name: "Paraná" },
    { code: "PE", name: "Pernambuco" },
    { code: "PI", name: "Piauí" },
    { code: "RJ", name: "Rio de Janeiro" },
    { code: "RN", name: "Rio Grande do Norte" },
    { code: "RS", name: "Rio Grande do Sul" },
    { code: "RO", name: "Rondônia" },
    { code: "RR", name: "Roraima" },
    { code: "SC", name: "Santa Catarina" },
    { code: "SP", name: "São Paulo" },
    { code: "SE", name: "Sergipe" },
    { code: "TO", name: "Tocantins" },
  ],

  // ── Argentina — 24 provinces ──────────────────────────────────────────────
  AR: [
    { code: "BA", name: "Buenos Aires" },
    { code: "CA", name: "Catamarca" },
    { code: "CH", name: "Chaco" },
    { code: "CT", name: "Chubut" },
    { code: "CB", name: "Córdoba" },
    { code: "CR", name: "Corrientes" },
    { code: "ER", name: "Entre Ríos" },
    { code: "FO", name: "Formosa" },
    { code: "JY", name: "Jujuy" },
    { code: "LP", name: "La Pampa" },
    { code: "LR", name: "La Rioja" },
    { code: "MZ", name: "Mendoza" },
    { code: "MN", name: "Misiones" },
    { code: "NQ", name: "Neuquén" },
    { code: "RN", name: "Río Negro" },
    { code: "SA", name: "Salta" },
    { code: "SJ", name: "San Juan" },
    { code: "SL", name: "San Luis" },
    { code: "SC", name: "Santa Cruz" },
    { code: "SF", name: "Santa Fe" },
    { code: "SE", name: "Santiago del Estero" },
    { code: "TF", name: "Tierra del Fuego" },
    { code: "TK", name: "Tucumán" },
    { code: "CABA", name: "Ciudad Autónoma de Buenos Aires" },
  ],

  // ── Colombia — departments ────────────────────────────────────────────────
  CO: [
    { code: "ANT", name: "Antioquia" },
    { code: "ATL", name: "Atlántico" },
    { code: "BOL", name: "Bolívar" },
    { code: "BOY", name: "Boyacá" },
    { code: "CAL", name: "Caldas" },
    { code: "CAQ", name: "Caquetá" },
    { code: "CAS", name: "Casanare" },
    { code: "CAU", name: "Cauca" },
    { code: "CES", name: "Cesar" },
    { code: "COR", name: "Córdoba" },
    { code: "CUN", name: "Cundinamarca" },
    { code: "HUI", name: "Huila" },
    { code: "LAG", name: "La Guajira" },
    { code: "MAG", name: "Magdalena" },
    { code: "MET", name: "Meta" },
    { code: "NAR", name: "Nariño" },
    { code: "NSA", name: "Norte de Santander" },
    { code: "PUT", name: "Putumayo" },
    { code: "QUI", name: "Quindío" },
    { code: "RIS", name: "Risaralda" },
    { code: "SAN", name: "Santander" },
    { code: "SUC", name: "Sucre" },
    { code: "TOL", name: "Tolima" },
    { code: "VAC", name: "Valle del Cauca" },
    { code: "BOG", name: "Bogotá D.C." },
  ],

  // ── Mexico — states ───────────────────────────────────────────────────────
  MX: [
    { code: "AGU", name: "Aguascalientes" },
    { code: "BCN", name: "Baja California" },
    { code: "BCS", name: "Baja California Sur" },
    { code: "CAM", name: "Campeche" },
    { code: "CHP", name: "Chiapas" },
    { code: "CHH", name: "Chihuahua" },
    { code: "CMX", name: "Ciudad de México" },
    { code: "COA", name: "Coahuila" },
    { code: "COL", name: "Colima" },
    { code: "DUR", name: "Durango" },
    { code: "GUA", name: "Guanajuato" },
    { code: "GRO", name: "Guerrero" },
    { code: "HID", name: "Hidalgo" },
    { code: "JAL", name: "Jalisco" },
    { code: "MEX", name: "Estado de México" },
    { code: "MIC", name: "Michoacán" },
    { code: "MOR", name: "Morelos" },
    { code: "NAY", name: "Nayarit" },
    { code: "NLE", name: "Nuevo León" },
    { code: "OAX", name: "Oaxaca" },
    { code: "PUE", name: "Puebla" },
    { code: "QUE", name: "Querétaro" },
    { code: "ROO", name: "Quintana Roo" },
    { code: "SLP", name: "San Luis Potosí" },
    { code: "SIN", name: "Sinaloa" },
    { code: "SON", name: "Sonora" },
    { code: "TAB", name: "Tabasco" },
    { code: "TAM", name: "Tamaulipas" },
    { code: "TLA", name: "Tlaxcala" },
    { code: "VER", name: "Veracruz" },
    { code: "YUC", name: "Yucatán" },
    { code: "ZAC", name: "Zacatecas" },
  ],

  // ── United States — 50 states + DC ────────────────────────────────────────
  US: [
    { code: "AL", name: "Alabama" },
    { code: "AK", name: "Alaska" },
    { code: "AZ", name: "Arizona" },
    { code: "AR", name: "Arkansas" },
    { code: "CA", name: "California" },
    { code: "CO", name: "Colorado" },
    { code: "CT", name: "Connecticut" },
    { code: "DE", name: "Delaware" },
    { code: "FL", name: "Florida" },
    { code: "GA", name: "Georgia" },
    { code: "HI", name: "Hawaii" },
    { code: "ID", name: "Idaho" },
    { code: "IL", name: "Illinois" },
    { code: "IN", name: "Indiana" },
    { code: "IA", name: "Iowa" },
    { code: "KS", name: "Kansas" },
    { code: "KY", name: "Kentucky" },
    { code: "LA", name: "Louisiana" },
    { code: "ME", name: "Maine" },
    { code: "MD", name: "Maryland" },
    { code: "MA", name: "Massachusetts" },
    { code: "MI", name: "Michigan" },
    { code: "MN", name: "Minnesota" },
    { code: "MS", name: "Mississippi" },
    { code: "MO", name: "Missouri" },
    { code: "MT", name: "Montana" },
    { code: "NE", name: "Nebraska" },
    { code: "NV", name: "Nevada" },
    { code: "NH", name: "New Hampshire" },
    { code: "NJ", name: "New Jersey" },
    { code: "NM", name: "New Mexico" },
    { code: "NY", name: "New York" },
    { code: "NC", name: "North Carolina" },
    { code: "ND", name: "North Dakota" },
    { code: "OH", name: "Ohio" },
    { code: "OK", name: "Oklahoma" },
    { code: "OR", name: "Oregon" },
    { code: "PA", name: "Pennsylvania" },
    { code: "RI", name: "Rhode Island" },
    { code: "SC", name: "South Carolina" },
    { code: "SD", name: "South Dakota" },
    { code: "TN", name: "Tennessee" },
    { code: "TX", name: "Texas" },
    { code: "UT", name: "Utah" },
    { code: "VT", name: "Vermont" },
    { code: "VA", name: "Virginia" },
    { code: "WA", name: "Washington" },
    { code: "WV", name: "West Virginia" },
    { code: "WI", name: "Wisconsin" },
    { code: "WY", name: "Wyoming" },
    { code: "DC", name: "District of Columbia" },
  ],

  // ── Chile — regions ───────────────────────────────────────────────────────
  CL: [
    { code: "AI", name: "Aysén" },
    { code: "AN", name: "Antofagasta" },
    { code: "AR", name: "La Araucanía" },
    { code: "AT", name: "Atacama" },
    { code: "BI", name: "Biobío" },
    { code: "CO", name: "Coquimbo" },
    { code: "LI", name: "O'Higgins" },
    { code: "LL", name: "Los Lagos" },
    { code: "LR", name: "Los Ríos" },
    { code: "MA", name: "Magallanes" },
    { code: "ML", name: "Maule" },
    { code: "NB", name: "Ñuble" },
    { code: "RM", name: "Metropolitana de Santiago" },
    { code: "TA", name: "Tarapacá" },
    { code: "VS", name: "Valparaíso" },
  ],
};

// ─── Cities by state ("CC-ST") ────────────────────────────────────────────────

export const CITIES_BY_STATE: Record<string, string[]> = {

  // Brazil — São Paulo
  "BR-SP": ["São Paulo", "Campinas", "Santos", "São José dos Campos", "Ribeirão Preto",
            "Sorocaba", "Guarulhos", "Osasco", "Santo André", "São Bernardo do Campo",
            "Bauru", "Jundiaí", "Piracicaba", "Americana", "Mogi das Cruzes"],

  // Brazil — Rio de Janeiro
  "BR-RJ": ["Rio de Janeiro", "Niterói", "Duque de Caxias", "São Gonçalo", "Nova Iguaçu",
            "Petrópolis", "Campos dos Goytacazes", "Volta Redonda", "Macaé", "Cabo Frio"],

  // Brazil — Minas Gerais
  "BR-MG": ["Belo Horizonte", "Uberlândia", "Contagem", "Juiz de Fora", "Betim",
            "Montes Claros", "Ribeirão das Neves", "Uberaba", "Governador Valadares", "Ipatinga"],

  // Brazil — Bahia
  "BR-BA": ["Salvador", "Feira de Santana", "Vitória da Conquista", "Camaçari", "Itabuna",
            "Ilhéus", "Porto Seguro", "Barreiras", "Juazeiro", "Lauro de Freitas"],

  // Brazil — Paraná
  "BR-PR": ["Curitiba", "Londrina", "Maringá", "Ponta Grossa", "Cascavel",
            "São José dos Pinhais", "Foz do Iguaçu", "Colombo", "Guarapuava", "Paranaguá"],

  // Brazil — Rio Grande do Sul
  "BR-RS": ["Porto Alegre", "Caxias do Sul", "Canoas", "Pelotas", "Santa Maria",
            "Gravataí", "Viamão", "Novo Hamburgo", "São Leopoldo", "Rio Grande"],

  // Brazil — Santa Catarina
  "BR-SC": ["Florianópolis", "Joinville", "Blumenau", "Chapecó", "Itajaí",
            "Criciúma", "Jaraguá do Sul", "Palhoça", "Lages", "Balneário Camboriú"],

  // Brazil — Pernambuco
  "BR-PE": ["Recife", "Caruaru", "Olinda", "Petrolina", "Paulista",
            "Cabo de Santo Agostinho", "Jaboatão dos Guararapes", "Surubim", "Garanhuns", "Ipojuca"],

  // Brazil — Ceará
  "BR-CE": ["Fortaleza", "Caucaia", "Juazeiro do Norte", "Maracanaú", "Sobral",
            "Crato", "Iguatu", "Quixadá", "Pacatuba", "Eusébio"],

  // Brazil — Pará
  "BR-PA": ["Belém", "Ananindeua", "Santarém", "Marabá", "Castanhal",
            "Parauapebas", "Abaetetuba", "Cametá", "Altamira", "Barcarena"],

  // Brazil — Goiás
  "BR-GO": ["Goiânia", "Aparecida de Goiânia", "Anápolis", "Rio Verde", "Luziânia",
            "Águas Lindas de Goiás", "Valparaíso de Goiás", "Trindade", "Formosa", "Novo Gama"],

  // Brazil — Maranhão
  "BR-MA": ["São Luís", "Imperatriz", "São José de Ribamar", "Timon", "Caxias",
            "Codó", "Paço do Lumiar", "Açailândia", "Bacabal", "Balsas"],

  // Brazil — Amazonas
  "BR-AM": ["Manaus", "Parintins", "Itacoatiara", "Manacapuru", "Coari",
            "Tefé", "Tabatinga", "Maués", "Eirunepé", "Humaitá"],

  // Brazil — Espírito Santo
  "BR-ES": ["Vitória", "Vila Velha", "Serra", "Cariacica", "Cachoeiro de Itapemirim",
            "Linhares", "São Mateus", "Colatina", "Guarapari", "Aracruz"],

  // Brazil — Mato Grosso
  "BR-MT": ["Cuiabá", "Várzea Grande", "Rondonópolis", "Sinop", "Tangará da Serra",
            "Cáceres", "Sorriso", "Lucas do Rio Verde", "Primavera do Leste", "Barra do Garças"],

  // Brazil — Mato Grosso do Sul
  "BR-MS": ["Campo Grande", "Dourados", "Três Lagoas", "Corumbá", "Grande Dourados",
            "Naviraí", "Nova Andradina", "Aquidauana", "Paranaíba", "Sidrolândia"],

  // Brazil — Rio Grande do Norte
  "BR-RN": ["Natal", "Mossoró", "Parnamirim", "São Gonçalo do Amarante", "Macaíba",
            "Caicó", "Assu", "Currais Novos", "Ceará-Mirim", "João Câmara"],

  // Brazil — Alagoas
  "BR-AL": ["Maceió", "Arapiraca", "Rio Largo", "Palmeira dos Índios", "União dos Palmares",
            "Penedo", "São Miguel dos Campos", "Marechal Deodoro", "Delmiro Gouveia", "Coruripe"],

  // Brazil — Piauí
  "BR-PI": ["Teresina", "Parnaíba", "Picos", "Piripiri", "Floriano",
            "Campo Maior", "Barras", "União", "Oeiras", "Pedro II"],

  // Brazil — Sergipe
  "BR-SE": ["Aracaju", "Nossa Senhora do Socorro", "Lagarto", "Itabaiana", "São Cristóvão",
            "Estância", "Nossa Senhora da Glória", "Tobias Barreto", "Barra dos Coqueiros", "Carmópolis"],

  // Brazil — Paraíba
  "BR-PB": ["João Pessoa", "Campina Grande", "Santa Rita", "Patos", "Bayeux",
            "Sousa", "Cajazeiras", "Cabedelo", "Guarabira", "Mamanguape"],

  // Brazil — Rondônia
  "BR-RO": ["Porto Velho", "Ji-Paraná", "Ariquemes", "Vilhena", "Cacoal",
            "Rolim de Moura", "Guajará-Mirim", "Jaru", "Ouro Preto do Oeste", "Buritis"],

  // Brazil — Tocantins
  "BR-TO": ["Palmas", "Araguaína", "Gurupi", "Porto Nacional", "Paraíso do Tocantins",
            "Colinas do Tocantins", "Guaraí", "Tocantinópolis", "Dianópolis", "Formoso do Araguaia"],

  // Brazil — Acre
  "BR-AC": ["Rio Branco", "Cruzeiro do Sul", "Sena Madureira", "Tarauacá", "Feijó",
            "Brasileia", "Bujari", "Mâncio Lima", "Plácido de Castro", "Porto Walter"],

  // Brazil — Amapá
  "BR-AP": ["Macapá", "Santana", "Laranjal do Jari", "Oiapoque", "Mazagão",
            "Porto Grande", "Tartarugalzinho", "Pedra Branca do Amapari", "Ferreira Gomes", "Cutias"],

  // Brazil — Roraima
  "BR-RR": ["Boa Vista", "Rorainópolis", "Caracaraí", "Alto Alegre", "Mucajaí",
            "Cantá", "Bonfim", "Pacaraima", "Iracema", "Amajari"],

  // Brazil — Distrito Federal
  "BR-DF": ["Brasília", "Ceilândia", "Taguatinga", "Samambaia", "Gama",
            "Planaltina", "Sobradinho", "Recanto das Emas", "Santa Maria", "Guará"],

  // Argentina
  "AR-BA": ["Buenos Aires", "La Plata", "Mar del Plata", "Bahía Blanca", "Quilmes", "Lanús"],
  "AR-CB": ["Córdoba", "Villa Carlos Paz", "Río Cuarto", "San Francisco", "Cosquín"],
  "AR-SF": ["Rosario", "Santa Fe", "Rafaela", "Reconquista", "Venado Tuerto"],
  "AR-MZ": ["Mendoza", "San Rafael", "Godoy Cruz", "Luján de Cuyo", "Las Heras"],
  "AR-NQ": ["Neuquén", "Zapala", "San Martín de los Andes", "Cutral-Có", "Plottier"],
  "AR-CABA": ["Buenos Aires (CABA)"],

  // Colombia
  "CO-ANT": ["Medellín", "Bello", "Envigado", "Itagüí", "Apartadó", "Manizales"],
  "CO-CUN": ["Bogotá", "Soacha", "Zipaquirá", "Facatativá", "Chía"],
  "CO-VAC": ["Cali", "Buenaventura", "Palmira", "Tuluá", "Bucaramanga"],
  "CO-BOG": ["Bogotá D.C."],
  "CO-ATL": ["Barranquilla", "Soledad", "Malambo", "Puerto Colombia"],
  "CO-SAN": ["Bucaramanga", "Floridablanca", "Piedecuesta", "Girón"],

  // Mexico
  "MX-CMX": ["Ciudad de México", "Gustavo A. Madero", "Iztapalapa", "Tlalpan", "Coyoacán"],
  "MX-JAL": ["Guadalajara", "Zapopan", "Tlaquepaque", "Puerto Vallarta", "Lagos de Moreno"],
  "MX-NLE": ["Monterrey", "San Nicolás de los Garza", "Guadalupe", "Apodaca", "San Pedro Garza García"],
  "MX-PUE": ["Puebla", "Tehuacán", "Atlixco", "San Martín Texmelucan"],
  "MX-SON": ["Hermosillo", "Ciudad Obregón", "Nogales", "Guaymas", "Caborca"],
  "MX-CHH": ["Ciudad Juárez", "Chihuahua", "Cuauhtémoc", "Delicias", "Parral"],

  // United States
  "US-CA": ["Los Angeles", "San Francisco", "San Diego", "San Jose", "Sacramento", "Fresno", "Oakland"],
  "US-TX": ["Houston", "San Antonio", "Dallas", "Austin", "Fort Worth", "El Paso", "Arlington"],
  "US-FL": ["Miami", "Orlando", "Tampa", "Jacksonville", "St. Petersburg", "Tallahassee"],
  "US-NY": ["New York City", "Buffalo", "Rochester", "Albany", "Yonkers", "Syracuse"],
  "US-IL": ["Chicago", "Aurora", "Naperville", "Joliet", "Rockford", "Springfield"],
  "US-PA": ["Philadelphia", "Pittsburgh", "Allentown", "Erie", "Reading", "Scranton"],
  "US-OH": ["Columbus", "Cleveland", "Cincinnati", "Toledo", "Akron", "Dayton"],
  "US-GA": ["Atlanta", "Augusta", "Columbus", "Macon", "Savannah"],
  "US-NC": ["Charlotte", "Raleigh", "Greensboro", "Durham", "Winston-Salem"],
  "US-WA": ["Seattle", "Spokane", "Tacoma", "Bellevue", "Redmond"],
  "US-CO": ["Denver", "Colorado Springs", "Aurora", "Fort Collins", "Boulder"],
  "US-DC": ["Washington D.C."],

  // Chile
  "CL-RM": ["Santiago", "Puente Alto", "Maipú", "La Florida", "Las Condes", "Peñalolén"],
  "CL-VS": ["Valparaíso", "Viña del Mar", "Concón", "Quilpué", "Villa Alemana"],
  "CL-BI": ["Concepción", "Talcahuano", "Chiguayante", "Coronel", "San Pedro de la Paz"],
};

// ─── Cities for countries without state-level data ────────────────────────────

export const CITIES_BY_COUNTRY: Record<string, string[]> = {
  PT: ["Lisboa", "Porto", "Braga", "Setúbal", "Faro", "Coimbra", "Funchal", "Aveiro"],
  ES: ["Madrid", "Barcelona", "Valencia", "Sevilla", "Zaragoza", "Málaga", "Bilbao"],
  DE: ["Berlin", "Hamburg", "Munich", "Cologne", "Frankfurt", "Stuttgart", "Düsseldorf"],
  FR: ["Paris", "Marseille", "Lyon", "Toulouse", "Nice", "Nantes", "Bordeaux", "Strasbourg"],
  GB: ["London", "Manchester", "Birmingham", "Glasgow", "Leeds", "Liverpool", "Bristol"],
  IT: ["Rome", "Milan", "Naples", "Turin", "Palermo", "Genoa", "Bologna", "Florence"],
  NL: ["Amsterdam", "Rotterdam", "The Hague", "Utrecht", "Eindhoven", "Groningen"],
  AU: ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide", "Canberra", "Darwin"],
  IN: ["Mumbai", "Delhi", "Bangalore", "Hyderabad", "Chennai", "Kolkata", "Pune", "Ahmedabad"],
  CN: ["Beijing", "Shanghai", "Shenzhen", "Guangzhou", "Chengdu", "Xi'an", "Wuhan"],
  JP: ["Tokyo", "Osaka", "Yokohama", "Nagoya", "Sapporo", "Fukuoka", "Kobe"],
  ZA: ["Johannesburg", "Cape Town", "Durban", "Pretoria", "Port Elizabeth"],
  NG: ["Lagos", "Kano", "Ibadan", "Abuja", "Port Harcourt", "Benin City"],
  BO: ["Santa Cruz de la Sierra", "La Paz", "Cochabamba", "Sucre", "Oruro", "Tarija"],
  EC: ["Guayaquil", "Quito", "Cuenca", "Santo Domingo", "Machala", "Durán"],
  PY: ["Asunción", "Ciudad del Este", "San Lorenzo", "Capiatá", "Luque", "Fernando de la Mora"],
  PE: ["Lima", "Arequipa", "Trujillo", "Chiclayo", "Piura", "Iquitos", "Cusco"],
  UY: ["Montevideo", "Salto", "Ciudad de la Costa", "Paysandú", "Las Piedras"],
  VE: ["Caracas", "Maracaibo", "Valencia", "Barquisimeto", "Maracay", "Ciudad Guayana"],
  CA: ["Toronto", "Montreal", "Vancouver", "Calgary", "Edmonton", "Ottawa", "Winnipeg"],
};

// ─── Helper functions ─────────────────────────────────────────────────────────

/** Returns the states for a given country, or [] if none defined. */
export function getStates(countryCode: string): GeoState[] {
  return STATES_BY_COUNTRY[countryCode] ?? [];
}

/** Returns the cities for a given country + optional state combination. */
export function getCities(countryCode: string, stateCode?: string): string[] {
  if (stateCode) {
    const key = `${countryCode}-${stateCode}`;
    const bySt = CITIES_BY_STATE[key];
    if (bySt && bySt.length > 0) return bySt;
  }
  return CITIES_BY_COUNTRY[countryCode] ?? [];
}
