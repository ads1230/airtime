// Where each time signal is broadcast for, so it is easy to pick the one a watch
// was made for. The API and the schedules still use the bare name.
const SERVICE_LOCATIONS: Record<string, string> = {
    DCF77: 'Europe',
    MSF: 'UK',
    WWVB: 'USA',
    JJY40: 'Japan',
    JJY60: 'Japan',
};

interface ServiceNameProps {
    service: string;
    // Grey the location, as in the pickers; off where the name already has a colour.
    quietLocation?: boolean;
}

// "MSF (UK)". A service without a known location is shown as it is.
export function ServiceName({ service, quietLocation = true }: ServiceNameProps) {
    const location = SERVICE_LOCATIONS[service];
    if (!location) return <>{service}</>;
    // One inline span, so a flex parent (a picker's value) keeps an ordinary space
    // between the name and the location rather than its own gap.
    return (
        <span>
            {service}{' '}
            <span className={quietLocation ? 'font-normal text-muted-foreground' : undefined}>({location})</span>
        </span>
    );
}
