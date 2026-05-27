/**
 * Use autocomplete to get a list of available regions.
 * @type {import('@remotion/lambda').AwsRegion}
 */
export const REGION = process.env.REMOTION_AWS_REGION ?? process.env.AWS_REGION ?? "us-east-1";

export const SITE_NAME = process.env.REMOTION_AWS_SITE_NAME ?? "sams-site";
export const RAM = 3008;
export const DISK = 10240;
export const TIMEOUT = 900;
