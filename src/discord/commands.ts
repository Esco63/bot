export type DiscordCommand = {
  name: string;
  description: string;
  options?: readonly {
    name: string;
    description: string;
    type: number;
    required?: boolean;
  }[];
};

export const commands: readonly DiscordCommand[] = [
  {
    name: "abmeldung",
    description: "Abmeldung für die Primetime",
  },
  {
    name: "ua",
    description: "Unabgemeldeten User eintragen",
    options: [
      {
        name: "name",
        description: "Name des Users",
        type: 3, // STRING
        required: true,
      },
    ],
  },
];
