import Stripe from 'stripe'
import supabase from './_supabase.js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

function methodNotAllowed() {
  return new Response('Method not allowed', { status: 405 })
}

export const GET = methodNotAllowed
export const PUT = methodNotAllowed
export const PATCH = methodNotAllowed
export const DELETE = methodNotAllowed
export const OPTIONS = methodNotAllowed
export const HEAD = methodNotAllowed

export async function POST(request) {
  if (process.env.STRIPE_LIVE_ENABLED !== '1') {
    return new Response('Not found', { status: 404 })
  }

  const action = new URL(request.url).searchParams.get('action')

  if (action === 'checkout') {
    const { uid, email, period } = await request.json()
    if (!uid || !email) {
      return Response.json({ error: 'Missing uid or email' }, { status: 400 })
    }

    let priceId
    if (period === 'monthly') priceId = process.env.STRIPE_PRICE_PRO_MONTHLY
    else if (period === 'annual') priceId = process.env.STRIPE_PRICE_PRO_ANNUAL
    else return Response.json({ error: 'Invalid period' }, { status: 400 })

    if (!priceId) {
      return Response.json({ error: 'Price not configured' }, { status: 400 })
    }

    const ALLOWED_ORIGINS = new Set(['https://thevigilroom.com','https://www.thevigilroom.com','https://vigil-khaki.vercel.app','http://localhost:5173'])
    const reqOrigin = request.headers.get('origin')
    const origin = ALLOWED_ORIGINS.has(reqOrigin) ? reqOrigin : 'https://thevigilroom.com'

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email,
      client_reference_id: uid,
      subscription_data: { metadata: { supabase_uid: uid } },
      success_url: `${origin}/?upgraded=1`,
      cancel_url: `${origin}/?upgrade=cancelled`,
    })

    return Response.json({ url: session.url })
  }

  if (action === 'webhook') {
    const rawBody = await request.text()
    const sig = request.headers.get('stripe-signature')

    let event
    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET,
      )
    } catch {
      return new Response('Invalid signature', { status: 400 })
    }

    if (!supabase) {
      return new Response('No DB', { status: 500 })
    }

    const now = new Date().toISOString()

    if (event.type === 'checkout.session.completed') {
      const s = event.data.object
      const uid = s.client_reference_id
      if (uid && s.subscription) {
        const sub = await stripe.subscriptions.retrieve(s.subscription)
        await supabase.from('subscriptions').upsert(
          {
            user_id: uid,
            plan: 'pro',
            status: sub.status,
            stripe_customer_id: s.customer,
            stripe_subscription_id: sub.id,
            updated_at: now,
          },
          { onConflict: 'user_id' },
        )
      }
    } else if (event.type === 'customer.subscription.updated') {
      const sub = event.data.object
      const uid = sub.metadata?.supabase_uid
      if (uid) {
        await supabase
          .from('subscriptions')
          .update({
            plan: 'pro',
            status: sub.status,
            stripe_customer_id: sub.customer,
            stripe_subscription_id: sub.id,
            updated_at: now,
          })
          .eq('user_id', uid)
      }
    } else if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object
      const uid = sub.metadata?.supabase_uid
      if (uid) {
        await supabase
          .from('subscriptions')
          .update({
            plan: 'free',
            status: 'canceled',
            updated_at: now,
          })
          .eq('user_id', uid)
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return Response.json({ error: 'Unknown action' }, { status: 400 })
}
