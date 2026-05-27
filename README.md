This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Remotion Lambda Setup

This repo already renders through `@remotion/lambda` on the server. To make it work with your AWS user:

1. Create a `.env.local` file in the project root.
2. Add your AWS credentials:

```bash
REMOTION_AWS_ACCESS_KEY_ID=your_access_key_id
REMOTION_AWS_SECRET_ACCESS_KEY=your_secret_access_key
AWS_REGION=us-east-1
```

3. Deploy the Remotion Lambda resources:

```bash
npm run remotion:lambda:deploy
```

If you want to compare or validate the IAM policy for your AWS user from this repo:

```bash
npm run remotion:lambda:policy:user
npm run remotion:lambda:policy:validate
```

4. Copy the printed values into `.env.local`:

```bash
REMOTION_AWS_REGION=us-east-1
REMOTION_AWS_SITE_NAME=your-deployed-site-name
REMOTION_AWS_LAMBDA_FUNCTION_NAME=your-deployed-function-name
REMOTION_LAMBDA_FRAMES_PER_FUNCTION=300
```

5. Restart the Next.js server.

If your AWS account is new or has a low Lambda concurrency quota, keep `REMOTION_LAMBDA_FRAMES_PER_FUNCTION` high to reduce parallelism. Higher values use fewer concurrent Lambda workers but make renders take longer.

The IAM policy for the deployment user must allow Lambda, S3, CloudWatch Logs, IAM pass-role, and Service Quotas access for the Remotion resources. The policy you shared is close, but rendering will only succeed after the deployed function name and site name are passed into the app through the environment variables above.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
